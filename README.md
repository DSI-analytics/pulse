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
- **Audit log** de ações sensíveis (sem dados clínicos no payload)
- Validação de input com Zod em todas as mutações
- Palavras-passe com `bcrypt`; segredos apenas em variáveis de ambiente
- Dinheiro em **centavos** (inteiros) para evitar erros de vírgula flutuante

---

## Começar (local, sem Docker)

Requer **Node 20+**. Se não tiver Node instalado, pode instalá-lo ao nível do
utilizador (sem admin) a partir de <https://nodejs.org/dist> (tarball macos-arm64)
e adicionar `~/.local/node/bin` ao `PATH`.

```bash
# 1. Dependências
npm install

# 2. Configuração
cp .env.example .env        # ajuste AUTH_SECRET (openssl rand -base64 48)

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
- [ ] Definir a política de retenção e backup dos dados clínicos (dados de saúde
      são sensíveis; confirme os requisitos legais aplicáveis em Moçambique).
- [ ] Rever quem tem perfil de Administrador.

> **Nota:** o `npm run db:dev` (PostgreSQL userland) destina-se **apenas a
> desenvolvimento local** — não o use para alojar.

---

## Credenciais de demonstração

Palavra-passe para todas: **`pulso123`**

| Perfil        | Email                             | Acesso |
| ------------- | --------------------------------- | ------ |
| Administrador | `admin@clinicamarianu.mz`         | Total |
| Rececionista  | `rececao@clinicamarianu.mz`       | Pacientes, marcações, check-in |
| Médico        | `medico@clinicamarianu.mz`        | Agenda própria, consultas, notas clínicas |
| Financeiro    | `financeiro@clinicamarianu.mz`    | Receitas, despesas, planos, relatórios |
| Gestor Stock  | `stock@clinicamarianu.mz`         | Stock, fornecedores, compras |

Dados semeados: 1 clínica (Maputo), 10 médicos, 300 pacientes, 7 especialidades,
4 seguradoras, ~5 800 marcações ao longo de 3 meses, receitas, despesas, faturas,
pagamentos, stock, compras e notificações — tudo em MZN.

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

Cobrem a lógica crítica (pura, sem BD):

- **Prevenção de duplo agendamento** e geração de vagas (`availability`)
- **Cálculo de ocupação**, utilização, no-show, receita/hora (`occupancy`)
- **Movimentos de stock** e custo médio ponderado (`stock`)
- **Matriz de permissões** por perfil (`rbac`)
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
- Insights determinísticos (regras) + arquitetura pronta para assistente com IA
- Autenticação, RBAC, isolamento de tenant, audit log, notificações

---

## Fase 2 (arquitetura preparada, ainda não construída)

Marcação online pelo paciente · portal do paciente · confirmação/lembretes por
WhatsApp/SMS · lista de espera · registo clínico eletrónico completo · gestão de
receituário · **assistente de gestão com LLM** (sobre métricas agregadas e seguras) ·
previsão de no-show e de capacidade · gestão de sinistros de seguradora · faturação
eletrónica · multi-filial na UI · app móvel · modo offline · integrações por API.

---

_Pulso · MVP v0.1 · construído para clínicas em Moçambique._
