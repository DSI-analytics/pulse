# Pulso — Gestão Clínica & Inteligência Operacional

Plataforma web multi-tenant para clínicas privadas, pensada para o mercado de
**Moçambique e África Austral**. Português (pt), moeda **MZN**, fuso **Africa/Maputo**.

Pulso responde a três perguntas, de forma excecionalmente clara:

1. **O que está a acontecer na minha clínica hoje?** — Dashboard + Agenda
2. **A minha clínica está financeiramente saudável?** — Financeiro + Planos
3. **Estou a usar bem os médicos e recursos?** — Ocupação médica + Stock

> Identidade **Pulso**: os indicadores do negócio como *sinais vitais* — um ECG
> como marca. Acento teal `#0C7C74`, neutros frios, cor reservada para estado.

---

## Stack

- **Next.js 16** (App Router, Server Components) · **TypeScript** · **React 19**
- **Tailwind CSS v4** + kit de componentes _shadcn-style_ (cva + tailwind-merge)
- **PostgreSQL** + **Prisma 6** (ORM, migrações)
- **Autenticação** própria de produção: `bcrypt` + JWT (`jose`) em cookie httpOnly
- **Zod** (validação) · **React Hook Form** · **Recharts** · **lucide-react** · **date-fns**
- **Vitest** (testes de lógica de domínio)
- Arquitetura **monólito modular**, compatível com Docker

---

## Arquitetura

```
src/
  app/
    (app)/            Área autenticada (sidebar + topbar partilhados)
      page.tsx        Dashboard executivo
      agenda/         Agenda diária + ações de estado
      pacientes/      Lista + perfil "Paciente 360"
      medicos/        Cartões de ocupação + detalhe com heatmap de capacidade
      financeiro/     Receitas, despesas, resultado, a receber/pagar
      planos/ stock/ fornecedores/ relatorios/ insights/ consultas/ configuracoes/
    login/  logout/  sem-acesso/
  components/         UI kit + componentes de domínio (KPI, status, gráficos)
  lib/                prisma, auth, rbac, money, datetime, utils
    domain/           Lógica pura testável (availability, occupancy)
  server/             Server Actions + camada de dados (analytics, booking, …)
prisma/
  schema.prisma       Modelo relacional multi-tenant (30+ modelos)
  seed.ts             Dados de demonstração (clínica de Maputo)
```

**Separação**: a lógica de domínio (`src/lib/domain`) é pura e testável; o acesso
a dados vive em `src/server`; a UI consome dados já agregados. Toda a leitura/escrita
é filtrada por `clinicId` a partir da sessão — nunca a partir do input do cliente.

### Multi-tenant desde o dia 1
Todos os registos relevantes têm `clinicId` (indexado). Os códigos legíveis são
únicos **dentro** da clínica (`@@unique([clinicId, code])`). A arquitetura prevê
**filiais** (`Branch`) sem expor essa complexidade na UI inicial.

### Segurança
- Sessões JWT assinadas (`AUTH_SECRET`), cookie `httpOnly`/`sameSite=lax`/`secure` em produção
- **RBAC** com matriz de permissões por perfil (`src/lib/rbac.ts`), verificada no servidor (`requirePermission`)
- Isolamento de tenant em todas as queries
- **Audit log imutável** (append-only garantido por trigger da base de dados),
  com before/after, IP, sessão e request id — sem credenciais nem texto clínico
- Proteção contra força bruta no login, sem enumeração de contas
- Validação de input com Zod em todas as mutações
- Palavras-passe com `bcrypt`; segredos apenas em variáveis de ambiente
- Documentos clínicos fora de `/public`, validados por bytes e servidos só por
  rota autenticada
- Dinheiro em **centavos** (inteiros) para evitar erros de vírgula flutuante

Detalhe completo em [`DOCUMENTACAO_TECNICA.md`](./DOCUMENTACAO_TECNICA.md).

---

## Começar (local, sem Docker)

Requer **Node 20+**. Se não tiver Node instalado, pode instalá-lo ao nível do
utilizador (sem admin) a partir de <https://nodejs.org/dist> (tarball macos-arm64)
e adicionar `~/.local/node/bin` ao `PATH`.

```bash
# 1. Dependências
npm install

# 2. Configuração
cp .env.example .env        # ajuste AUTH_SECRET e DEFAULT_USER_PASSWORD

# 3. Base de dados de desenvolvimento (PostgreSQL userland, porta 5433)
npm run db:dev              # deixe a correr num terminal

# 4. Migrar + gerar cliente + semear (noutro terminal)
npm run db:migrate
npm run db:seed

# 5. Arrancar a app
npm run dev                 # http://localhost:3000
```

> **Nota (ambiente restrito):** sob alguns ambientes headless o compilador
> Turbopack não consegue lançar o worker de PostCSS. Nesse caso use
> `next dev --webpack` (ver `.claude/launch.json`). Num terminal normal,
> `npm run dev` (Turbopack) funciona sem alterações.

### Aceder a partir de outro computador da rede

`npm run dev` já escuta em todos os interfaces (`0.0.0.0`) e anuncia o endereço
no arranque:

```
- Local:         http://localhost:3000
- Network:       http://192.168.30.15:3000   ← use este no outro computador
```

Duas condições têm de estar reunidas:

1. **`allowedDevOrigins`** — já configurado em `next.config.ts` para as gamas
   privadas (`192.168.*.*`, `10.*.*.*`, `172.16–31.*.*`) e para o nome da
   máquina. Sem isto o Next bloqueia os recursos de desenvolvimento e a página
   abre sem JavaScript. Para autorizar outra origem, defina `DEV_ALLOWED_ORIGINS`
   no `.env` (valores separados por vírgulas).

2. **Firewall do Windows** — é preciso abrir a porta 3000 **uma vez**, num
   PowerShell **como administrador**:

   ```powershell
   New-NetFirewallRule -DisplayName "Pulso dev (3000)" -Direction Inbound `
     -Action Allow -Protocol TCP -LocalPort 3000 `
     -Profile Private,Public -RemoteAddress LocalSubnet
   ```

   `-RemoteAddress LocalSubnet` limita o acesso à rede local — a porta não fica
   exposta em redes públicas. Para remover: `Remove-NetFirewallRule -DisplayName "Pulso dev (3000)"`.

> **Isto é só para desenvolvimento.** O servidor de dev não deve ser usado para
> alojar a aplicação: sem HTTPS, o cookie de sessão viaja em claro na rede.
> Para uso real, veja *Hospedar em produção*.

### Alternativa com Docker
```bash
docker compose up -d db
# DATABASE_URL="postgresql://pulso:pulso@localhost:5432/pulso?schema=public"
npm run db:migrate && npm run db:seed && npm run dev
```

---

## Hospedar em produção

A app gera um bundle **standalone** (`output: "standalone"`), por isso corre em
qualquer sítio com Node 20+ ou Docker.

### Opção A — Docker (VPS, DigitalOcean, Hetzner, servidor próprio)

```bash
# 1. Definir o segredo de sessão
echo "AUTH_SECRET=$(openssl rand -base64 48)" >> .env

# 2. Subir base de dados + aplicação
docker compose up -d --build

# 3. Aplicar as migrações na base de dados de produção
docker compose exec app npx prisma migrate deploy
```

A app fica em `http://SEU_IP:3000` — coloque um **Nginx/Caddy com HTTPS** à frente
(obrigatório: as sessões usam cookies `secure` em produção).

### Opção B — Plataforma gerida (Vercel, Railway, Render)

1. Ligue o repositório Git.
2. Crie uma base de dados **PostgreSQL** gerida (Neon, Supabase, Railway…).
3. Defina as variáveis de ambiente: `DATABASE_URL`, `AUTH_SECRET`, `APP_TZ=Africa/Maputo`.
4. Comando de build: `npm run build` · Comando de migração: `npm run db:deploy`.

### Checklist antes de pôr no ar (importante)

- [ ] **`AUTH_SECRET` novo e aleatório** (`openssl rand -base64 48`) — nunca o do exemplo.
- [ ] `DATABASE_URL` a apontar para um PostgreSQL **gerido com backups automáticos**.
- [ ] **HTTPS obrigatório** (os cookies de sessão são `secure` fora de desenvolvimento).
- [ ] **Não correr `npm run db:seed` em produção** — apaga tudo e cria dados fictícios.
      Em produção use apenas `npm run db:deploy`.
- [ ] **Apagar/alterar as contas de demonstração** e a palavra-passe `pulso123`.
- [ ] Definir uma `DEFAULT_USER_PASSWORD` forte; é aplicada ao criar ou redefinir
      acessos na área de Configurações.
- [ ] Definir a política de retenção e backup dos dados clínicos (dados de saúde
      são sensíveis; confirme os requisitos legais aplicáveis em Moçambique).
      **Snapshots do fornecedor de cloud não são um backup** — ver a secção 12 da
      documentação técnica (RPO/RTO, procedimento de restauro e teste periódico).
- [ ] Definir `PULSO_UPLOAD_DIR` para um **volume persistente incluído no backup**;
      sem ele o prontuário fica com referências a ficheiros inexistentes.
- [ ] Rever quem tem perfil de Administrador e quem tem `audit.view`.
- [ ] Se usar a API FHIR: definir `FHIR_BASE_URL`, emitir tokens de `ApiClient`
      com os scopes mínimos e um prazo de validade, e servir apenas por HTTPS.
- [ ] Se usar o assistente de Insights: definir `AI_API_KEY` **fora do
      repositório**. Sem chave, a aba continua a funcionar em modo determinístico.

> **Nota:** o `npm run db:dev` (PostgreSQL userland) destina-se **apenas a
> desenvolvimento local** — não o use para alojar.

---

## Credenciais de demonstração

Palavra-passe para todas: **`pulso123`**

| Perfil            | Email                             | Acesso |
| ----------------- | --------------------------------- | ------ |
| Administrador     | `admin@clinicamarianu.mz`         | Total, incluindo auditoria e API FHIR |
| Gestor da Clínica | `gestor@clinicamarianu.mz`        | **Insights e leitura operacional/financeira — sem privilégios administrativos nem acesso clínico** |
| Rececionista      | `rececao@clinicamarianu.mz`       | Pacientes, marcações, check-in |
| Médico            | `medico@clinicamarianu.mz`        | Prontuário completo, prescrições, exames, internamentos |
| Enfermeiro        | `enfermagem@clinicamarianu.mz`    | Leitura clínica, sinais vitais, alergias, documentos |
| Téc. Laboratório  | `laboratorio@clinicamarianu.mz`   | Pedidos e resultados de exames |
| Financeiro        | `financeiro@clinicamarianu.mz`    | Receitas, despesas, planos, relatórios, Insights |
| Gestor Stock      | `stock@clinicamarianu.mz`         | Stock, fornecedores, compras |

Dados semeados: 1 clínica (Maputo), 10 médicos, 300 pacientes, 7 especialidades,
4 seguradoras, ~5 800 marcações ao longo de 3 meses, receitas, despesas, faturas,
pagamentos, stock, compras e notificações — mais 400 episódios clínicos com sinais
vitais, diagnósticos codificados (ICD-10), alergias, receitas e pedidos/resultados
de exames. Tudo em MZN e **inteiramente fictício**.

---

## Scripts

| Comando            | Descrição |
| ------------------ | --------- |
| `npm run dev`      | Servidor de desenvolvimento |
| `npm run build`    | Build de produção |
| `npm run db:dev`   | PostgreSQL userland (dev, porta 5433) |
| `npm run db:migrate` | Aplicar migrações Prisma |
| `npm run db:seed`  | Semear dados de demonstração |
| `npm run db:studio`| Prisma Studio |
| `npm run db:reset` | Repor a base de dados |
| `npm run test`     | Testes (Vitest) |

---

## Testes

135 testes cobrem a lógica crítica (pura, sem BD):

- **Prevenção de duplo agendamento** e geração de vagas (`availability`)
- **Cálculo de ocupação**, utilização, no-show, receita/hora (`occupancy`)
- **Movimentos de stock** e custo médio ponderado (`stock`)
- **Matriz de permissões** por perfil, incluindo os limites do Gestor da Clínica
  e o acesso restrito à auditoria (`rbac`)
- **Redacção de auditoria**: credenciais e texto clínico nunca chegam ao log
  (`audit-redaction`)
- **Sinais vitais**: IMC, limites plausíveis, sinalização fora do intervalo (`vitals`)
- **Alergias vs. prescrição**: correspondência por princípio activo (`allergy-check`)
- **Detecção de pacientes duplicados** (`patient-matching`)
- **Insights**: escolha de métrica, períodos, isolamento por permissão e
  resistência a *prompt injection* (`insights-matching`)
- **Mapeamento e validação FHIR**, incluindo `OperationOutcome` (`fhir/*`)
- **Limite de taxa** (`rate-limit`)
- **Formatação/parse de MZN** (`money`)

```bash
npm run test
```

---

## Funcionalidades implementadas

- Dashboard executivo (6 KPIs, consultas de hoje, ocupação, tendências, receita por
  especialidade/plano, feed de insights) — **tudo derivado da BD**
- Agenda diária com estados (Marcada → Confirmada → Chegou → Em espera → Em consulta →
  Concluída / Cancelada / Não compareceu) e ações de recepção
- **+ Nova Marcação** global: pesquisa de paciente, registo rápido, especialidade →
  médico → data/hora → plano, com **prevenção de conflitos**
- Pesquisa global **⌘K** (pacientes, médicos, fornecedores, planos)
- Perfil **Paciente 360** (pessoal, plano, histórico, financeiro, notas clínicas com RBAC)
- **Ocupação e capacidade médica**: cartões, métricas de utilização e **heatmap semanal**
- Financeiro: receitas, despesas, resultado, margem, a receber/pagar, métodos de pagamento
- Planos de saúde: faturado, recebido, por receber, prazos por seguradora
- **Serviços e Exames**: tabela de preços da clínica (análises, imagiologia, procedimentos);
  ao marcar um exame é obrigatório indicar **qual**, e o preço vem do serviço
- Stock com **alertas** (baixo, esgotado, a expirar, ritmo de consumo) e **movimentos**
  (saída/consumo, entrada manual, ajuste de inventário, perda) com histórico
- **Compras a fornecedores**: ao registar como recebida, dá **entrada automática no stock**,
  recalcula o custo médio e lança a despesa em contas a pagar
- Relatórios com **exportação CSV** e vista para impressão
- Autenticação, RBAC, isolamento de tenant, notificações por permissão

### Prontuário clínico eletrónico

- **Cadastro único** do paciente com deteção de duplicados (documento, telefone,
  e-mail, nome, data de nascimento) e fusão administrativa auditada
- **Episódios clínicos** (consulta, urgência, acompanhamento, internamento,
  procedimento, exame, encaminhamento)
- **Sinais vitais** com IMC calculado, limites validados e sinalização de valores
  fora do intervalo de referência
- **Diagnósticos** com `code` + `codeSystem` (preparado para ICD-10/CID e SNOMED CT)
- **Alergias** estruturadas, destacadas no topo do prontuário, com verificação
  contra prescrições antes da emissão
- **Prescrições** com histórico — uma receita antiga nunca é alterada em silêncio
- **Exames** (laboratório e imagiologia) com ciclo de estados e resultados com
  intervalo de referência e sinalização de anormalidade
- **Procedimentos, tratamentos e internamentos** com alta e resumo
- **Linha temporal clínica** com filtros e carregamento incremental por cursor
- **Documentos clínicos** validados por bytes, guardados fora de `/public` e
  entregues apenas por rota autenticada e auditada

### Segurança e governação

- Perfil **Gestor da Clínica** — Insights da sua instituição sem privilégios
  administrativos, com autorização institucional explícita
- **Auditoria completa e imutável**: before/after, IP, sessão, endpoint,
  request id; `UPDATE`/`DELETE` rejeitados pela base de dados
- Painel de auditoria com filtros, paginação e comparação antes/depois
- Proteção contra força bruta no login, sem enumeração de contas

### Interoperabilidade e IA

- **API HL7 FHIR R4** com 13 recursos, autenticada, com scopes, limite de taxa,
  validação de payload, `OperationOutcome` e auditoria de todas as operações
- **Assistente de Insights** sobre um catálogo fechado de métricas — o modelo
  não acede à base de dados nem executa SQL, e não consegue contornar o RBAC

---

## Documentação técnica

Arquitetura, modelos, migrações, RBAC, auditoria, FHIR (com exemplos), IA,
segurança, testes, backups (RPO/RTO) e dívida técnica:
**[`DOCUMENTACAO_TECNICA.md`](./DOCUMENTACAO_TECNICA.md)**.

---

## Próximas fases

Marcação online pelo paciente · confirmação/lembretes por WhatsApp/SMS · lista de
espera · previsão de no-show e de capacidade · gestão de sinistros de seguradora ·
faturação eletrónica · multi-filial na UI · app móvel · modo offline · adaptadores
de laboratório e farmácia sobre a camada de integração já existente.

---

_Pulso · MVP v0.1 · construído para clínicas em Moçambique._
