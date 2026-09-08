# Pulso — Documentação Técnica

Prontuário clínico electrónico, controlo de acesso, auditoria, interoperabilidade
HL7 FHIR e assistente de Insights.

Este documento cobre o que foi construído na reforma do sistema. Para instalação
e visão geral do produto, ver [`README.md`](./README.md).

---

## 1. Arquitectura

O sistema mantém a arquitectura Next.js (App Router) + Prisma + PostgreSQL já
existente. As camadas novas encaixam nela sem reescrever o domínio:

```
UI (React Server/Client Components)
  ↓
Route Handlers  /  Server Actions            src/app/**, src/server/*-actions.ts
  ↓
Application Services                          src/server/*.ts
  ↓
Domain (puro, testável)                       src/lib/domain/*.ts
  ↓
Prisma Client                                 src/lib/prisma.ts
  ↓
PostgreSQL
```

Integrações externas ficam fora do domínio:

```
Application
  ↓
Integration Interface        src/lib/fhir/{ids,mappers,validation}.ts
  ↓
FHIR Adapter                 src/lib/fhir/{repository,writers,handlers}.ts
  ↓
Sistema externo (laboratório, hospital, farmácia, seguradora…)
```

Insights:

```
Insights Controller     src/app/api/insights/chat/route.ts
  ↓
Authorization           getAuthorizedUser + can() + resolveClinicScope
  ↓
Analytics Service       src/server/analytics-metrics.ts   (catálogo fechado)
  ↓
AI Orchestrator         src/server/insights-assistant.ts
  ↓
LLM Provider            @anthropic-ai/sdk
```

Auditoria:

```
Server Actions / Route Handlers / proxy.ts (correlation id)
  ↓
Audit Service           src/lib/audit.ts + src/lib/audit-redaction.ts
  ↓
Append-only Audit Store AuditLog (trigger de base de dados)
```

### Princípio transversal

Cada acesso a dados filtra por `clinicId` na consulta. O `clinicId` vem sempre
da sessão (`requireUser()` / `getAuthorizedUser()`), nunca do corpo do pedido.
Onde um cliente pode pedir outra instituição (Insights), `resolveClinicScope()`
só honra o pedido se existir uma linha em `UserClinicAccess`.

---

## 2. Módulos

| Módulo | Ficheiros principais |
| --- | --- |
| Cadastro de pacientes | `src/server/patient-registry.ts`, `src/server/patient-data.ts`, `src/lib/domain/patient-matching.ts` |
| Pesquisa de pacientes | `src/server/patient-search.ts` |
| Prontuário — leitura | `src/server/clinical-record.ts` |
| Prontuário — escrita | `src/server/clinical-actions.ts` |
| Linha temporal | `src/server/timeline-actions.ts`, `src/components/clinical/clinical-timeline.tsx` |
| Sinais vitais | `src/lib/domain/vitals.ts` |
| Alergias e alertas | `src/lib/domain/allergy-check.ts`, `src/components/clinical/clinical-alerts.tsx` |
| Documentos clínicos | `src/lib/documents.ts`, `src/server/document-actions.ts`, `src/app/api/documentos/[id]/route.ts` |
| RBAC | `src/lib/rbac.ts`, `src/lib/auth.ts` |
| Auditoria | `src/lib/audit.ts`, `src/lib/audit-redaction.ts`, `src/server/audit-log.ts`, `src/app/(app)/auditoria/page.tsx` |
| Autenticação | `src/server/auth-actions.ts`, `src/lib/rate-limit.ts` |
| Notificações | `src/server/notifications.ts` |
| FHIR | `src/lib/fhir/*`, `src/app/fhir/**` |
| Insights | `src/server/analytics-metrics.ts`, `src/server/insights-assistant.ts`, `src/lib/domain/insights-matching.ts` |

---

## 3. Modelo de dados

### 3.1 Modelos novos

| Modelo | Papel |
| --- | --- |
| `UserClinicAccess` | Autorização explícita de um utilizador sobre uma instituição |
| `PatientIdentityDocument` | Vários documentos de identificação por paciente |
| `Encounter` | Episódio clínico — agrega consultas, exames, procedimentos, internamentos |
| `VitalSign` | Sinais vitais, com IMC calculado e parâmetros extra em `Json` |
| `Diagnosis` | Diagnóstico com `code` + `codeSystem` (preparado para ICD-10/CID e SNOMED CT) |
| `Allergy` | Alergia/intolerância estruturada, com `substanceKey` normalizada |
| `Medication` | Catálogo de medicamentos da instituição |
| `Prescription` / `PrescriptionItem` | Receita e respectivos medicamentos |
| `DiagnosticOrder` | Pedido de exame (laboratório, imagiologia, outros) |
| `DiagnosticResult` / `DiagnosticResultItem` | Resultado e parâmetros, com intervalo de referência e sinalização de anormalidade |
| `ClinicalProcedure` | Procedimento realizado |
| `Treatment` | Plano de tratamento e evolução |
| `Admission` | Internamento e alta |
| `ClinicalAttachment` | Documento clínico (metadados; o ficheiro vive fora de `/public`) |
| `FhirResource` | Identidade FHIR: `fhirId` opaco ↔ registo interno, `versionId`, `lastUpdated`, identificadores externos |
| `ApiClient` | Aplicação externa autorizada na API FHIR (token guardado como hash SHA-256) |
| `LoginAttempt` | Tentativas de autenticação (protecção contra força bruta) |

### 3.2 Modelos alterados

- **`Patient`** — dados pessoais alargados (género/identidade, estado civil,
  nacionalidade, profissão, idioma, fotografia), contactos (telefone alternativo),
  endereço estruturado (país → província → distrito → cidade → bairro → rua →
  número → referência), contacto de emergência (relação e telefone alternativo),
  informação clínica geral (grupo sanguíneo, doenças crónicas, antecedentes
  pessoais/cirúrgicos/familiares, hábitos, resumo clínico), `isActive` +
  `deactivatedAt` (inactivação em vez de eliminação), `mergedIntoId` (fusão de
  duplicados), `version` (bloqueio optimista) e `createdById`.
- **`Consultation`** — registo estruturado (queixa principal, história da doença
  actual, sintomas, exame físico, avaliação, plano terapêutico, encaminhamentos),
  `encounterId`, `version` e `updatedAt`. Os campos antigos (`subjective`,
  `notes`, `diagnosis`, `prescription`, `recommendations`) mantêm-se — o editor
  clínico existente continua a funcionar sem alterações.
- **`Appointment`** — `encounterId` opcional.
- **`AuditLog`** — ver secção 5.
- **`Notification`** — `userId` (destinatário) e `requiredPermission`.
- **`UserRole`** — novos perfis: `CLINIC_MANAGER`, `NURSE`, `LAB_TECHNICIAN`,
  `PHARMACIST`.

Todos os modelos clínicos têm `clinicId` indexado e um índice
`(clinicId, patientId, <data>)` para a linha temporal.

### 3.3 Migrações

| Migração | Conteúdo |
| --- | --- |
| `20260901140738_add_clinic_manager_role_and_user_clinic_access` | Perfis novos + `UserClinicAccess` |
| `20260901140934_expand_audit_log` | Campos de auditoria (before/after, IP, sessão, endpoint, resultado…) |
| `20260901141000_harden_audit_log_immutability` | Trigger que rejeita `UPDATE`/`DELETE` em `AuditLog` |
| `20260901141742_clinical_record_and_interoperability` | Todo o prontuário + `FhirResource`, `ApiClient`, `LoginAttempt` |
| `20260901142000_patient_search_indexes` | Índices de trigrama (`pg_trgm`) para pesquisa por nome/telefone/e-mail/documento |

Nenhuma migração apaga dados. Só há colunas e tabelas novas, mais índices e um
trigger. Colunas obrigatórias adicionadas a tabelas com linhas existentes têm
`@default` para permitir o preenchimento retroactivo.

A migração de trigramas é tolerante: se `pg_trgm` não puder ser instalada,
regista um aviso e continua — as consultas caem para os índices btree.

```bash
npm run db:migrate     # desenvolvimento
npm run db:deploy      # produção
```

---

## 4. RBAC

Catálogo em `src/lib/rbac.ts`. **Nenhuma protecção existe apenas no frontend**:
cada página chama `requirePermission()` e cada acção de servidor chama `guard()`
antes de tocar em dados. O `NAV_ITEMS` filtrado é apenas cosmético.

### 4.1 Permissões novas

`encounter.view` · `encounter.manage` · `vitals.record` · `allergy.manage` ·
`prescription.create` · `laboratory.view` · `laboratory.manage` ·
`admission.manage` · `document.view` · `document.manage` · `insights.view` ·
`audit.view` · `fhir.access`

### 4.2 Perfis

| Perfil | Resumo |
| --- | --- |
| `SUPER_ADMIN`, `CLINIC_ADMIN` | Tudo |
| `CLINIC_MANAGER` | **Insights + leitura operacional e financeira. Sem privilégios administrativos, sem acesso clínico, sem escrita.** |
| `RECEPTIONIST` | Pacientes, marcações, check-in |
| `DOCTOR` | Prontuário completo, prescrições, exames, internamentos |
| `NURSE` | Leitura clínica, sinais vitais, alergias, documentos |
| `LAB_TECHNICIAN` | Laboratório e resultados |
| `PHARMACIST` | Leitura clínica limitada + stock |
| `FINANCE` | Financeiro, planos, relatórios, Insights |
| `INVENTORY_MANAGER` | Stock e fornecedores |

### 4.3 Gestor da Clínica

Requisito central: acesso aos Insights da sua instituição **sem** privilégios
administrativos globais.

- `insights.view` sim; `user.manage`, `settings.manage`, `audit.view`,
  `fhir.access` **não** — verificado em `src/lib/rbac.test.ts`.
- A associação instituição↔utilizador é explícita em `UserClinicAccess`.
- `authorizedClinicIds(user)` devolve a clínica de origem mais as autorizadas;
  `resolveClinicScope(user, requestedClinicId)` ignora qualquer `clinicId`
  fora desse conjunto. Um gestor da Clínica A nunca alcança dados da Clínica B.

---

## 5. Auditoria

### 5.1 O que é registado

Autenticação (`auth.login`, `auth.login.failed`, `auth.login.blocked`,
`auth.logout`), acesso a informação clínica (`patient.record.view`,
`patient.timeline.view`, `attachment.download`), criação/alteração/inactivação de
pacientes, episódios, sinais vitais, diagnósticos, alergias, prescrições, pedidos
e resultados de exames, procedimentos, tratamentos, internamentos, documentos,
utilizadores, perfis, configurações, financeiro, stock, todas as operações FHIR
e todas as perguntas ao assistente de Insights.

### 5.2 Campos

`id` · `clinicId` · `userId` · `userName` · `userRole` · `module` · `action` ·
`entity` · `entityId` · `before` · `after` · `result` (`SUCESSO`/`FALHA`/`NEGADO`) ·
`ipAddress` · `userAgent` · `sessionId` · `requestId` · `endpoint` ·
`httpMethod` · `metadata` · `createdAt`.

`before`/`after` guardam **apenas os campos alterados** — ver
`changedFields()` em `src/lib/audit-redaction.ts`.

### 5.3 O que NUNCA é registado

- Palavras-passe, hashes, tokens, segredos, cookies, `Authorization` — em
  qualquer nível de aninhamento (`redact()`).
- Texto clínico livre. Um diagnóstico ou uma nota aparecem como
  `«texto clínico (N car.)»`: fica registado que mudou e o tamanho, não o
  conteúdo.

### 5.4 Imutabilidade

```sql
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION pulso_audit_log_append_only();
```

A base de dados rejeita `UPDATE` e `DELETE` — não é uma convenção da aplicação.
As chaves estrangeiras para `Clinic` e `User` usam `Restrict`, para que apagar
uma clínica ou um utilizador não possa arrastar o rasto consigo.

O seed de desenvolvimento usa `TRUNCATE TABLE "AuditLog"` (não dispara triggers
de linha e exige privilégio de dono da tabela) — continua a não existir nenhum
caminho da aplicação capaz de apagar registos.

### 5.5 Acesso

`/auditoria`, permissão `audit.view`, concedida apenas a `SUPER_ADMIN` e
`CLINIC_ADMIN`. Filtros por pesquisa livre, utilizador, acção, módulo, entidade,
resultado, IP e intervalo de datas, com paginação e vista de detalhe
antes/depois.

---

## 6. Prontuário clínico electrónico

### 6.1 Cadastro único

`Patient.code` é único por clínica. Antes de criar, `findDuplicateCandidates()`
pontua candidatos por documento (70), telefone (30), e-mail (25), nome exacto
(30) ou parcial (15), data de nascimento (25) e sexo (5); datas de nascimento
diferentes penalizam. Acima de 70 pontos a criação é bloqueada e exige
confirmação explícita. A fusão (`mergePatients`) é administrativa, corre em
transacção, transfere toda a actividade e **inactiva** a origem com referência
para o destino — nunca apaga.

### 6.2 Episódios

`Encounter` suporta `CONSULTA`, `URGENCIA`, `ACOMPANHAMENTO`, `INTERNAMENTO`,
`PROCEDIMENTO`, `EXAME`, `ENCAMINHAMENTO`. Consultas, sinais vitais,
diagnósticos, prescrições, pedidos de exame, procedimentos, tratamentos,
internamentos e documentos ligam-se opcionalmente a um episódio.
`resolveClinicalLinks()` valida que o episódio/consulta/internamento indicado
pertence à mesma clínica **e** ao mesmo paciente — impede IDOR por payload.

### 6.3 Sinais vitais

Pressão arterial, frequência cardíaca e respiratória, temperatura, saturação,
peso, altura, **IMC calculado**, glicemia, dor e parâmetros extra configuráveis
(`extra Json`). Valores fora dos limites fisicamente plausíveis são rejeitados;
valores fora do intervalo de referência são sinalizados (`AVISO` / `CRITICO`) na
linha temporal e nos alertas de topo.

### 6.4 Alergias e verificação de prescrição

Antes de gravar uma receita, `checkAllergyConflicts()` compara o medicamento e o
princípio activo com as alergias **activas** do paciente. Um conflito `GRAVE` ou
`FATAL` bloqueia a emissão até confirmação explícita
(`acknowledgeAllergyWarnings`), e os avisos ficam gravados no próprio item da
receita e no log de auditoria.

> **Âmbito, deliberadamente limitado:** a verificação usa apenas dados
> estruturados já existentes no prontuário. Não infere interacções
> medicamentosas, não consulta bases externas e **não usa IA generativa para
> produzir informação farmacológica**. A ausência de alerta não significa
> "seguro". Para verificação farmacológica real é necessário ligar um adaptador
> a uma base validada.

### 6.5 Prescrições

Uma prescrição antiga **nunca** é alterada em silêncio: emitir uma substituição
(`replacesId`) suspende a anterior e regista os dois eventos. Estados: `ACTIVA`,
`CONCLUIDA`, `SUSPENSA`, `CANCELADA`.

### 6.6 Exames

Estados do pedido: `SOLICITADO` → `AGENDADO` → `RECOLHIDO` → `EM_PROCESSAMENTO`
→ `CONCLUIDO` / `CANCELADO`. O resultado tem conclusão, notas, datas de
realização e validação, responsável e parâmetros com valor, unidade, intervalo de
referência e sinalização de anormalidade. Ao lançar um resultado é criada uma
notificação com `requiredPermission: "laboratory.view"`.

### 6.7 Linha temporal

`getPatientTimeline()` consulta cada fonte com `take: limit + 1` sobre um índice
`(clinicId, patientId, data)`, funde e ordena. Filtros por período, tipo de
evento, especialidade e profissional. Paginação por cursor de data — o custo não
cresce com a antiguidade do paciente e o histórico completo nunca é carregado
para o cliente.

### 6.8 Documentos

- Tipo determinado pelos **bytes iniciais** (PDF, JPEG, PNG, TIFF, DICOM), nunca
  pela extensão nem pelo `Content-Type` do cliente.
- Nome em disco gerado pelo servidor; `storageKey` resolvido contra a raiz
  configurada (defesa contra path traversal mesmo com a base de dados adulterada).
- Armazenamento **fora de `/public`** (`PULSO_UPLOAD_DIR`).
- Entrega apenas por `GET /api/documentos/[id]`, que revalida sessão,
  `document.view` e clínica, responde com `Content-Disposition: attachment` e
  `X-Content-Type-Options: nosniff`, e audita o descarregamento.
- Eliminação é *soft delete* (`deletedAt`) e auditada.

---

## 7. API HL7 FHIR (R4)

### 7.1 Mapeamento

| Domínio interno | Recurso FHIR |
| --- | --- |
| `Patient` | `Patient` |
| `Doctor` | `Practitioner` |
| `Clinic` | `Organization` |
| `Encounter` | `Encounter` |
| `Appointment` | `Appointment` |
| `VitalSign` | `Observation` (perfil vital-signs, componentes LOINC) |
| `Diagnosis` | `Condition` |
| `Allergy` | `AllergyIntolerance` |
| `Medication` | `Medication` |
| `Prescription` | `MedicationRequest` (um por item, `groupIdentifier` comum) |
| `DiagnosticResult` | `DiagnosticReport` (parâmetros como `contained` Observations) |
| `ClinicalProcedure` | `Procedure` |
| `ClinicalAttachment` | `DocumentReference` |

O modelo interno **não** foi alterado para se parecer com FHIR. `src/lib/fhir/mappers.ts`
é puro e testável; a persistência fica em `repository.ts` / `writers.ts`.

### 7.2 Endpoints

```
GET  /fhir/metadata                     CapabilityStatement
GET  /fhir/{resourceType}               pesquisa (Bundle searchset)
POST /fhir/{resourceType}               criação
GET  /fhir/{resourceType}/{id}          leitura
PUT  /fhir/{resourceType}/{id}          actualização
```

`resourceType` ∈ os 13 recursos acima. Escrita disponível para `Patient`,
`AllergyIntolerance`, `Condition` e `Observation`; os restantes são leitura e
respondem **405 com `OperationOutcome`** — em vez de aceitarem dados que não
conseguiriam representar fielmente. `PATCH` e `DELETE` respondem 405: dados
clínicos inactivam-se por mudança de estado.

Parâmetros suportados: `_count` (máx. 100), `_offset`, e por recurso
`identifier`, `name`, `family`, `birthdate`, `active`, `patient`, `subject`,
`status`, `date`, `clinical-status`, `code`. `date` aceita os prefixos `eq`,
`ge`, `gt`, `le`, `lt`.

Todas as respostas — incluindo erros — usam
`Content-Type: application/fhir+json`. Leituras devolvem `ETag` e
`Last-Modified` a partir de `meta.versionId` / `meta.lastUpdated`.

### 7.3 Identificadores e versionamento

O id interno **nunca** é exposto. `FhirResource` mantém `fhirId` (UUID opaco) ↔
`(internalModel, internalId)`, com `versionId`, `lastUpdated` e
`externalIdentifiers` para identificadores atribuídos por sistemas terceiros —
o que permite integrar vários sistemas sem colisões.

### 7.4 Segurança

- Sem autenticação não há endpoint FHIR. Dois modos:
  **(a)** `Authorization: Bearer <token>` de um `ApiClient` (token guardado só
  como hash SHA-256, com `scopes`, `isActive` e `expiresAt`);
  **(b)** sessão da aplicação, exigindo a permissão `fhir.access`.
- Autorização por scopes no formato SMART on FHIR — `system/Patient.read`,
  `system/*.write`, `system/*.*` — o que permite migrar para OAuth 2.0 / OIDC
  sem alterar os handlers.
- Limite de taxa por cliente/utilizador (`FHIR_RATE_LIMIT`, 120/min por omissão),
  com `429` + `Retry-After`.
- Validação de payload antes de qualquer escrita (secção 7.5).
- Isolamento por instituição em todas as consultas: um recurso de outra clínica
  responde `404`, indistinguível de inexistente.
- Todas as operações — incluindo negadas e falhadas — geram auditoria com
  cliente, IP, endpoint, método e request id.

### 7.5 Validação

`src/lib/fhir/validation.ts` verifica `resourceType`, estrutura, tipos,
referências (`Patient/{id}`, `Encounter/{id}`) e os campos que a aplicação exige.
Não se aceita JSON arbitrário por trazer um `resourceType`. Erros devolvem
`OperationOutcome` com `severity`, `code` e `expression` (caminho FHIR do
problema).

### 7.6 Exemplos

> Dados fictícios. Nunca use dados de pacientes reais em exemplos ou testes.

```bash
# CapabilityStatement
curl -H "Authorization: Bearer $TOKEN" https://app.exemplo.mz/fhir/metadata

# Pesquisar pacientes por nome
curl -H "Authorization: Bearer $TOKEN" \
  "https://app.exemplo.mz/fhir/Patient?name=Machava&_count=20"

# Ler um paciente
curl -H "Authorization: Bearer $TOKEN" \
  https://app.exemplo.mz/fhir/Patient/cfef2151-06c1-4f31-9ecf-23820ab16f29

# Sinais vitais de um paciente
curl -H "Authorization: Bearer $TOKEN" \
  "https://app.exemplo.mz/fhir/Observation?patient=Patient/{id}&date=ge2026-01-01"

# Registar uma alergia
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "AllergyIntolerance",
    "patient": { "reference": "Patient/{id}" },
    "code": { "text": "Penicilina" },
    "type": "allergy",
    "category": ["medication"],
    "criticality": "high",
    "reaction": [{
      "manifestation": [{ "text": "Urticaria generalizada" }],
      "severity": "severe"
    }]
  }' https://app.exemplo.mz/fhir/AllergyIntolerance

# Registar sinais vitais (LOINC)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Observation",
    "status": "final",
    "subject": { "reference": "Patient/{id}" },
    "effectiveDateTime": "2026-05-01T10:00:00Z",
    "component": [
      { "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6" }] },
        "valueQuantity": { "value": 128, "unit": "mmHg" } },
      { "code": { "coding": [{ "system": "http://loinc.org", "code": "8462-4" }] },
        "valueQuantity": { "value": 82, "unit": "mmHg" } }
    ]
  }' https://app.exemplo.mz/fhir/Observation
```

Erro típico:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "required",
    "diagnostics": "`name` é obrigatório e precisa de pelo menos 3 caracteres.",
    "expression": ["Patient.name"]
  }]
}
```

### 7.7 Registar um cliente de API

Não existe interface para isto ainda (ver secção 11). Por agora, via Prisma
Studio ou script, criando um `ApiClient` com o **hash** do token:

```js
import { createHash } from "node:crypto";
const token = crypto.randomUUID() + crypto.randomUUID(); // entregue ao parceiro, uma só vez
await prisma.apiClient.create({
  data: {
    clinicId,
    name: "Laboratório X",
    tokenHash: createHash("sha256").update(token).digest("hex"),
    scopes: ["system/Patient.read", "system/DiagnosticReport.write"],
    expiresAt: new Date("2027-01-01"),
  },
});
```

---

## 8. Insights com IA

### 8.1 Arquitectura

```
Utilizador → Insights Chat → Backend autenticado → RBAC + instituição
          → Analytics Service (catálogo fechado) → LLM → Resposta
```

O modelo **não tem acesso à base de dados**. Recebe uma lista de identificadores
de métricas e escolhe um; o servidor executa a consulta correspondente, já
limitada pela clínica e pela permissão. Depois o modelo recebe **apenas os
números agregados** para redigir a frase.

Consequências:

- Não há execução de SQL enviado pelo modelo. Nunca.
- Um identificador fora do catálogo é rejeitado antes de qualquer acesso a dados.
- A permissão é verificada duas vezes: ao construir a lista de métricas
  disponíveis e imediatamente antes de executar a métrica escolhida.
- Nenhum dado individual de paciente é enviado ao modelo.
- Sem `AI_API_KEY`, o assistente continua a funcionar em modo determinístico
  (correspondência por palavras-chave sobre o mesmo catálogo).

### 8.2 Métricas disponíveis

Pacientes (total, novos, activos, evolução) · Consultas (total, por estado,
cancelamentos, faltas, por profissional, por especialidade, evolução, por dia da
semana, por hora) · Especialidades (procura, crescimento) · Financeiro (receita,
evolução, pagamentos recebidos, pendentes, receita média por paciente) ·
Operacional (duração média de atendimento, produtividade por profissional).

Cada métrica declara a permissão que exige. As financeiras exigem `finance.view`;
as de produtividade exigem `doctor.stats`.

### 8.3 Protecção contra prompt injection

- A pergunta é tratada como conteúdo não confiável, delimitada em `<pergunta>`,
  e os prompts de sistema instruem explicitamente a ignorar instruções nela
  contidas.
- **A autorização nunca depende do modelo.** Mesmo que este devolvesse um
  identificador proibido, o servidor rejeita-o. Mesmo que a pergunta diga
  "mostre a receita da Clínica B", a métrica corre com o `clinicId` da sessão.
- Um `clinicId` no corpo do pedido só é honrado se existir em `UserClinicAccess`;
  caso contrário é ignorado e a tentativa fica registada em auditoria
  (`crossTenantAttempt`).
- A resposta ao frontend é texto simples mais um descritor de gráfico validado
  (`{ type, data: [{label, value}] }`). **O frontend não interpreta HTML nem
  executa JavaScript produzido pelo modelo** — os gráficos são desenhados pelos
  componentes já existentes.
- A aba é *read-only*: não existe caminho de escrita de dados de negócio.
- Limite de taxa por utilizador (`AI_RATE_LIMIT`, 20/min por omissão).

### 8.4 Configuração

```bash
AI_ENABLED="true"
AI_PROVIDER="anthropic"
AI_API_KEY="sk-ant-..."      # nunca no repositório
AI_MODEL="claude-opus-5"
AI_RATE_LIMIT="20"
```

---

## 9. Segurança

### 9.1 Autenticação

- Palavras-passe com bcrypt (custo 10).
- Sessão JWT (HS256) em cookie `httpOnly`, `sameSite=lax`, `secure` em produção,
  8 horas.
- Revogação imediata por `sessionVersion` — alterar a palavra-passe ou desactivar
  a conta invalida sessões abertas.
- Cada sessão tem um `sessionId` registado em cada evento de auditoria.
- Protecção contra força bruta em duas barreiras: 8 tentativas/15 min por conta e
  30/15 min por IP.
- Mensagem única (`Credenciais inválidas.`) para conta inexistente, palavra-passe
  errada e conta inactiva — não permite enumerar contas.
- Tentativas falhadas registadas em `LoginAttempt` e em auditoria.

### 9.2 Backend

- `clinicId` sempre da sessão; `userId`, `role` e `permissions` nunca são lidos
  do cliente.
- IDOR: cada acção revalida que o registo pertence à clínica **e**, no
  prontuário, ao paciente.
- Mass assignment: todas as entradas passam por esquemas Zod ou normalizadores
  explícitos com lista de campos permitidos.
- SQL injection: Prisma parametriza tudo; as duas consultas `$queryRaw` usam
  interpolação com parâmetros (template tag), nunca concatenação.
- Upload: validação por bytes, tamanho máximo, tipos permitidos e permissão.
- Cabeçalhos: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.
- Nenhum endpoint sem autenticação; `/api/*` responde 401 JSON, as páginas
  redireccionam para `/login`.

### 9.3 Privacidade

- Dados clínicos exigem `consultation.viewClinical`; financeiros exigem
  `finance.view`.
- Acessos a informação clínica sensível são auditados.
- Logs de aplicação não recebem dados de pacientes; a auditoria não recebe texto
  clínico.
- Segredos vêm de variáveis de ambiente; `.env*` está no `.gitignore` (excepto
  `.env.example`, sem valores reais).

### 9.4 Concorrência

`Patient`, `Consultation`, `Encounter`, `Prescription`, `DiagnosticOrder` e
`Admission` têm `version`. `updatePatientProfile()` aceita `expectedVersion` e
recusa a gravação com uma mensagem explícita quando o registo mudou entretanto,
em vez de sobrepor silenciosamente.

---

## 10. Testes

```bash
npm run test        # 135 testes
npm run lint
npx tsc --noEmit
npm run build
```

| Área | Ficheiro |
| --- | --- |
| RBAC, Gestor da Clínica, isolamento de auditoria | `src/lib/rbac.test.ts` |
| Redacção e diff de auditoria | `src/lib/audit-redaction.test.ts` |
| Sinais vitais (IMC, limites, sinalização) | `src/lib/domain/vitals.test.ts` |
| Alergias vs. prescrição | `src/lib/domain/allergy-check.test.ts` |
| Detecção de duplicados | `src/lib/domain/patient-matching.test.ts` |
| Insights: métricas, períodos, permissões, prompt injection | `src/lib/domain/insights-matching.test.ts` |
| Mapeamento FHIR | `src/lib/fhir/mappers.test.ts` |
| Validação FHIR e `OperationOutcome` | `src/lib/fhir/validation.test.ts` |
| Limite de taxa | `src/lib/rate-limit.test.ts` |
| (pré-existentes) agenda, ocupação, stock, faturação, MZN | `src/lib/domain/*`, `src/lib/*` |

Os testes são unitários e não tocam na base de dados. A cobertura de integração
(FHIR ponta a ponta, auditoria com escrita real, isolamento entre clínicas com
HTTP) foi validada manualmente contra uma base de dados descartável — ver
secção 11 para o que falta automatizar.

**Dados de teste:** sempre fictícios. Nunca copiar pacientes reais, nunca colocar
dados clínicos reais no repositório, nunca credenciais reais em seeds.

---

## 11. Dívida técnica e limitações conhecidas

| Item | Impacto | Recomendação |
| --- | --- | --- |
| Limite de taxa em memória, por instância | Num deployment horizontal cada instância tem o seu contador | Contador partilhado (Redis) ou rate limiting no proxy/WAF |
| Sem interface para gerir `ApiClient` | Registar clientes FHIR exige script/Prisma Studio | Ecrã em Configurações, com emissão de token uma única vez |
| Sem interface para gerir `UserClinicAccess` | Autorizar um gestor sobre outra instituição exige script | Ecrã na gestão de utilizadores |
| Escrita FHIR limitada a 4 recursos | Parceiros não podem criar episódios/receitas por API | Alargar quando o contrato de mapeamento inverso estiver definido |
| `PATCH` FHIR não suportado | Actualização exige o recurso completo | Definir contrato de merge antes de implementar |
| Sem testes de integração automatizados | Regressões em rotas HTTP não são apanhadas pelo CI | Harness com base de dados descartável + testes de rota |
| Terminologias clínicas não validadas | `code`/`codeSystem` aceitam qualquer valor | Integrar catálogo ICD-10/SNOMED CT e validar contra ele |
| Verificação de alergias sem base farmacológica | Só compara dados estruturados internos | Adaptador para base farmacológica validada |
| Sem ecrã de gestão de anexos | O upload existe como acção de servidor, sem UI dedicada | Componente de upload no prontuário |
| Armazenamento de documentos em disco local | Não escala horizontalmente | Object storage (S3/compatível) atrás da mesma interface |

---

## 12. Backups e recuperação

**Não existe backup automático configurado neste repositório.** Snapshots do
fornecedor de cloud **não** constituem uma estratégia de backup: não são
testados, não têm retenção definida e não cobrem os ficheiros clínicos.

### 12.1 O que tem de ser copiado

1. A base de dados PostgreSQL (inclui o prontuário e toda a auditoria).
2. O directório `PULSO_UPLOAD_DIR` (documentos clínicos).

Um backup só da base de dados deixa o prontuário com referências a ficheiros
inexistentes.

### 12.2 Objectivos recomendados

| Objectivo | Valor recomendado | Como se atinge |
| --- | --- | --- |
| **RPO** (perda máxima aceitável) | 15 minutos | WAL archiving contínuo (PITR) além do dump diário |
| **RTO** (tempo máximo de reposição) | 4 horas | Procedimento de restauro documentado e ensaiado |
| Retenção | 7 dias diários · 4 semanais · 12 mensais · 7 anos anuais | A retenção longa acompanha a obrigação de conservação do processo clínico |

### 12.3 Backup

```bash
# Base de dados (diário, fora do horário de atendimento)
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  > "/backups/pulso-$(date +%F).dump"

# Documentos clínicos (incremental)
rsync -a --delete "$PULSO_UPLOAD_DIR/" "/backups/uploads/"
```

Cifrar em repouso, guardar fora da máquina da aplicação e restringir o acesso.

### 12.4 Restauro

```bash
createdb pulso_restore
pg_restore --dbname=pulso_restore --no-owner "/backups/pulso-2026-09-01.dump"
# Verificar contagens e a integridade da auditoria antes de promover.
```

### 12.5 Teste periódico

Restaurar para uma base descartável **pelo menos trimestralmente**, confirmar
contagens de pacientes/consultas/auditoria e registar a data e o resultado. Um
backup nunca restaurado não é um backup.

---

## 13. Variáveis de ambiente

Ver `.env.example` para a lista completa e comentada. Resumo das novas:

| Variável | Predefinição | Descrição |
| --- | --- | --- |
| `PULSO_UPLOAD_DIR` | `./var/uploads` | Raiz dos documentos clínicos (fora de `/public`) |
| `PULSO_MAX_UPLOAD_MB` | `15` | Tamanho máximo por ficheiro |
| `FHIR_ENABLED` | activo | `"false"` desliga a API FHIR |
| `FHIR_BASE_URL` | `urn:pulso` | Base dos `identifier.system` |
| `FHIR_RATE_LIMIT` | `120` | Pedidos/minuto por cliente |
| `AI_ENABLED` | activo | `"false"` força o modo determinístico |
| `AI_PROVIDER` | `anthropic` | Fornecedor de IA |
| `AI_API_KEY` | — | Chave; sem ela o assistente funciona sem IA |
| `AI_MODEL` | `claude-opus-5` | Modelo |
| `AI_RATE_LIMIT` | `20` | Perguntas/minuto por utilizador |
| `AUDIT_RETENTION_DAYS` | `2555` | Retenção recomendada (informativo — não há expurgo automático) |

Nunca colocar valores reais no repositório.
