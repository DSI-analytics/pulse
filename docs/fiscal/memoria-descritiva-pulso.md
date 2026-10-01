# Memória Descritiva — Sistema «Pulso — Gestão Clínica»

Documento de apoio ao pedido de avaliação e validação dirigido à Direcção-Geral de Impostos —
Máquinas Fiscais. Descreve o sistema tal como se encontra implementado à data e identifica, de forma
expressa, os requisitos fiscais ainda por implementar (secção 12).

## 1. Identificação do sistema

| Elemento | Descrição |
| --- | --- |
| Denominação | Pulso — Gestão Clínica e Inteligência Operacional |
| Versão | «VERSÃO» (v0.1 — MVP à data deste documento) |
| Produtor | «PRODUTOR / EQUIPA», NUIT «NUIT» |
| Tipo de programa | Aplicação de gestão clínica com módulo financeiro integrado (facturação e recibos) |
| Modo de utilização | Aplicação web, em navegador, com instalação em servidor da instituição ou em alojamento próprio |
| Idiomas | Português e Inglês |
| Moeda e fuso horário | Configuráveis por instituição; predefinição MZN e Africa/Maputo |
| Dimensão | 55 tabelas de dados, 16 migrações de base de dados, cerca de 36 400 linhas de código |

## 2. Finalidade e âmbito

O sistema destina-se à gestão corrente de unidades sanitárias privadas, cobrindo cadastro de
pacientes, agenda e marcações, prontuário clínico electrónico, catálogo de serviços e exames, planos
de saúde, stock e fornecedores, e o módulo financeiro objecto deste pedido.

Cada instituição constitui um espaço de dados isolado (multi-instituição), com utilizadores,
documentos e numeração próprios.

## 3. Arquitectura e ambiente tecnológico

| Camada | Tecnologia |
| --- | --- |
| Interface e servidor de aplicação | Next.js 16 (App Router) e React 19, em TypeScript |
| Acesso a dados | Prisma 6 (ORM), com esquema versionado por migrações |
| Base de dados | PostgreSQL 18 |
| Autenticação | Sessão assinada (JWT) em cookie `httpOnly`; palavras-passe cifradas com `bcrypt` |
| Distribuição | Instalação local (on-premise) ou servidor dedicado; a facturação não depende de serviços externos |

## 4. Módulo financeiro

1. **Facturação** — a factura é emitida a partir da conclusão de uma consulta ou do registo de
   serviços prestados, com linhas de detalhe (descrição, quantidade, preço unitário e total).
   Quando o paciente tem plano de saúde, o valor é repartido entre a parte do paciente e a parte da
   seguradora, segundo as regras do plano.
2. **Recibos** — o registo de um pagamento gera um recibo com número próprio, associado à factura,
   com o valor, o meio de pagamento e a data.
3. **Meios de pagamento** — numerário, M-Pesa, e-Mola, cartão, transferência bancária e seguradora.
4. **Entradas e saídas** — receitas reconhecidas por consulta, procedimento, exame ou produto, e
   despesas por categoria, com fornecedor, data e estado.
5. **Contas a receber** — saldo em aberto por factura e por seguradora, com antiguidade de saldos.

## 5. Documentos emitidos

| Documento | Conteúdo actual |
| --- | --- |
| Factura | Número, data de emissão, instituição emitente, paciente, plano de saúde quando aplicável, linhas de detalhe, subtotal, total, valor pago e estado (rascunho, emitida, parcial, paga, anulada) |
| Recibo | Número, data, factura associada, paciente, valor recebido, meio de pagamento e referência da transacção |

## 6. Numeração

A numeração é atribuída pelo sistema no momento da emissão, por instituição e por ano civil, e é
única (garantida por restrição de unicidade na base de dados). Os episódios clínicos, prescrições,
pedidos de exame, internamentos e pacientes usam contadores sequenciais no formato
`PREFIXO-ANO-00000`.

**À data deste documento, as facturas e os recibos usam um sufixo aleatório** (`FAC-2026-XXXXXXXX`,
`REC-2026-XXXXXXXX`) **e não um contador sequencial** — ver secção 12, ponto 1.

## 7. Integridade e inalterabilidade dos registos

1. **Registo de auditoria inviolável** — todas as operações relevantes são registadas com autor,
   perfil, sessão, endereço IP, endpoint, identificador do pedido e o conteúdo antes/depois. A
   tabela de auditoria é *append-only*: o próprio PostgreSQL rejeita `UPDATE` e `DELETE`, por
   gatilho definido em migração, pelo que nenhuma camada da aplicação consegue reescrever o rasto.
2. **Registos clínicos permanentes** — os registos clínicos não podem ser alterados nem eliminados,
   também por imposição da base de dados. Correcções fazem-se por registo novo ou por adenda ligada
   ao registo original, com autor e data.
3. **Facturas e recibos** — a aplicação **não disponibiliza qualquer função de edição ou de
   eliminação** de facturas ou recibos emitidos. As únicas alterações possíveis resultam do registo
   de pagamentos (valor pago e estado da factura). A extensão desta imutabilidade ao nível da base
   de dados está identificada na secção 12, ponto 4.
4. **Controlo de concorrência** — versionamento optimista nos registos sujeitos a edição simultânea.

## 8. Controlo de acessos

Dez perfis com permissões granulares (super-administrador, administrador, gestor da clínica,
recepcionista, médico, enfermeiro, técnico de laboratório, farmacêutico, financeiro e gestor de
stock). Todas as permissões são verificadas no servidor; o interface apenas reflecte o que já foi
autorizado. O acesso aos dados financeiros exige permissão específica.

## 9. Segurança

Sessões assinadas com expiração, protecção contra tentativas sucessivas de autenticação sem
enumeração de contas, limites de taxa nos serviços expostos, isolamento estrito por instituição em
todas as consultas à base de dados, e documentos clínicos guardados fora da árvore pública, servidos
apenas por rota autenticada e auditada.

## 10. Conservação de dados e cópias de segurança

Os dados residem na base de dados PostgreSQL da instituição. O período de retenção do registo de
auditoria é configurável e está definido por omissão em 2555 dias (sete anos). A execução e guarda
das cópias de segurança é da responsabilidade da instituição operadora, segundo o procedimento
descrito na documentação de instalação.

## 11. Interoperabilidade

API HL7 FHIR R4 autenticada, com âmbitos de acesso, limite de taxa e auditoria de todas as operações;
classificação de diagnósticos pela CID-11 da Organização Mundial da Saúde, com catálogo obtido da
própria OMS.

## 12. Conformidade fiscal — estado actual e plano de adequação

| N.º | Requisito | Estado actual | Acção prevista |
| --- | --- | --- | --- |
| 1 | Numeração sequencial por série, sem lacunas | **Em falta** — sufixo aleatório | Implementar séries e contador sequencial por série e ano, com detecção de lacunas |
| 2 | IVA: taxa, motivo de isenção e totais por taxa | **Em falta** — o sistema não tem campos de imposto | Acrescentar taxa e motivo de isenção por linha, e totais por taxa no documento |
| 3 | Menções obrigatórias no documento impresso (NUIT do adquirente, designação e série do documento, identificação do software) | **Parcial** — imprime emitente, paciente, linhas e totais | Acrescentar o NUIT do adquirente e as menções que vierem a ser indicadas |
| 4 | Inalterabilidade dos documentos emitidos | **Parcial** — sem edição nem eliminação na aplicação; falta bloqueio na base de dados e encadeamento por assinatura | Estender os gatilhos de imutabilidade às tabelas financeiras e encadear documentos por resumo criptográfico |
| 5 | Anulação de documentos | **Em falta** — o estado «anulada» existe, mas não há operação de anulação | Implementar anulação com motivo, autor e data, sem eliminar o documento |
| 6 | Eliminação de registos financeiros | **Não conforme** — as despesas podem ser eliminadas | Substituir a eliminação por anulação auditada |
| 7 | Registo de auditoria inviolável | **Implementado** — imposto pela base de dados | Manter e alargar às operações financeiras |
| 8 | SAF-T (MZ) | **Em falta** | Gerar o ficheiro no formato publicado pela Autoridade Tributária |
| 9 | Comunicação das facturas emitidas à Autoridade Tributária | **Em falta** | Integrar segundo o protocolo publicado para máquinas fiscais / SGMF |
| 10 | Conservação pelo prazo legal | **Parcial** — retenção de auditoria configurada em sete anos | Documentar a política de conservação e de cópias de segurança |

A requerente compromete-se a executar este plano de adequação segundo o calendário que vier a ser
acordado com esta Direcção-Geral.

## 13. Ambiente de demonstração

Será disponibilizado acesso a uma instância de demonstração, com dados fictícios, e credenciais
específicas para a equipa de avaliação, em documento reservado anexo ao requerimento.

## 14. Contactos

| Função | Nome | Contacto |
| --- | --- | --- |
| Responsável técnico | «NOME» | «TELEFONE» / «E-MAIL» |
| Representante legal | «NOME» | «TELEFONE» / «E-MAIL» |

---

**Referências públicas consultadas** (a confirmar junto da DGI no acto de submissão): lista
provisória de softwares de facturação e especificações técnicas de máquinas fiscais publicadas pela
Autoridade Tributária de Moçambique; protocolo de integração entre máquinas fiscais e o SGMF;
comunicações da AT sobre a submissão dos dados das facturas emitidas e a preparação do SAF-T (MZ).
