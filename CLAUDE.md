# Taverna — CLAUDE.md

## O que é este projeto

Taverna é um **orquestrador de agentes Claude Code** — um motor que lê projetos de um vault Obsidian, constrói prompts com contexto preciso e spawna instâncias do `claude` CLI para executar trabalho real em cada projeto.

A metáfora central é um **deadpool de taverna**: projetos são contratos, agentes são mercenários, e o scheduler é o dono que distribui os contratos para quem é elegível no momento. O `@dev-agent` trabalha em projetos de infra, o `@study-assistant` estuda matérias da USP, o `@planner` cuida de side projects.

Não é um chatbot. Não tem interface interativa. É um sistema de automação headless que roda em segundo plano via systemd, mas pode ser acessado via tmux.

## Fonte de verdade

O vault vive em `~/tmp` (configurável via `VAULT_PATH`). Este CLAUDE.md é a referência interna autoritativa para agentes que modificam o código. O README.md no repo aponta para cá.

---

## Arquitetura em camadas

A regra principal: **business logic no core, CLI é thin**.

```
CLI (src/cli.ts)                 ← parse args → chama core → imprime
  │
  ├── Scheduler (src/pm/scheduler.ts)    ← daemon de tick, coração do sistema
  │     ├── scorer.ts                   ← ranking: deadline/priority/health/stale
  │     ├── policies.ts                 ← isProjectDue, type policies, at-constraints
  │     ├── run-window.ts               ← janelas de horário HH:MM-HH:MM
  │     ├── execute.ts                  ← runOnce + drainProject (pipeline de execução)
  │     └── executor.ts                 ← spawna `claude --print --output-format json`
  │
  ├── Plugin System (src/plugin/)        ← features + hooks de ciclo do scheduler
  │     └── TAVERNA_PLUGINS env var      ← carrega plugins externos
  │
  ├── Vault Adapter (src/vault/)         ← lê projetos/tasks/agentes do filesystem
  │
  ├── HTTP Server (src/server/)          ← dashboard, SSE, API REST
  │
  └── MCP Server (src/mcp/)             ← tools para uso do Claude Code
```

### Fluxo de um tick do scheduler

```
runScheduler()
  │
  ├─ plugin.beforeTick()        ← ex: clockify sincroniza horas antes do scan
  │
  ├─ scanVault()                ← lê todos os projetos/tasks/agentes do vault
  │
  ├─ Para cada projeto:
  │   ├─ isProjectDue()         ← verifica run_every vs _last_run
  │   ├─ hostname affinity      ← skip se projeto está em outro host
  │   ├─ isRunWindowOpen()      ← verifica janela HH:MM-HH:MM
  │   └─ isAtSatisfied()        ← verifica at: 09:00 / EOD do step ativo
  │
  ├─ rankProjects()             ← ordena por score (deadline → priority → health → stale)
  │
  ├─ Para cada projeto (em ordem de score):
  │   ├─ drainProject()         ← ≤ N iterações, re-lê estado entre tasks
  │   │   └─ runOnce()          ← runAgent → atualiza logbook → inbox → snapshot
  │   └─ plugin.afterRun()      ← ex: assets faz upload após run
  │
  └─ sleep(tickMs) → repete
```

### execute vs schedule

`taverna execute` = um tick do scheduler (maxTicks: 1).
`taverna schedule` = daemon infinito (maxTicks: ∞, tickMs: 60s).

Ambos usam `runScheduler()` — a lógica de eligibilidade, ranking e execução é idêntica.

---

## Plugin System (`src/plugin/`)

Plugins são projetos npm separados descobertos via `TAVERNA_PLUGINS` (caminhos separados por `:`).

```ts
interface TavernaPlugin {
  name: string

  // Features → MCP tools + HTTP routes automáticos
  features?: FeatureDef[]

  // Comandos CLI adicionais
  registerCommands?: (program: Command, ctx: FeatureContext) => void

  // Hooks de ciclo do scheduler (opcionais)
  beforeTick?: (ctx: FeatureContext) => Promise<void>
  afterRun?: (result: AgentResult, project: VaultProject, ctx: FeatureContext) => Promise<void>
}
```

**Plugins first-party** (repos separados em `~/tools/`):
- `taverna-assets` — gerenciamento de assets com `.asset` pointers
- `taverna-edisciplinas` — crawler e registry de materiais USP

Cada feature vira automaticamente um MCP tool (`taverna_<name>`) e uma rota HTTP (`/api/<name>`).

---

## Módulos

| Módulo | Responsabilidade |
|--------|-----------------|
| `src/pm/scheduler.ts` | Daemon de tick — core do sistema |
| `src/pm/execute.ts` | `runOnce` + `drainProject` — pipeline de execução |
| `src/pm/executor.ts` | `runAgent`, `runPipeline`, `runSession` — spawna claude |
| `src/pm/scorer.ts` | Ranking multi-fator de projetos |
| `src/pm/policies.ts` | `isProjectDue`, type policies, `isAtSatisfied`, `mergePolicy` |
| `src/pm/run-window.ts` | `isRunWindowOpen` — janelas de horário |
| `src/pm/policy-resolver.ts` | Resolução de permissões agent↔project |
| `src/pm/budget.ts` | Budget guard diário por projeto |
| `src/pm/prompt.ts` | Constrói o prompt (diretiva + Task Completion Protocol + tasks) |
| `src/pm/loki.ts` | Eventos JSON (agent_run, project_snapshot), `computeHealth` |
| `src/pm/event-bus.ts` | Barramento de eventos (stdout/Kafka via `setEventBus()`) |
| `src/pm/matrix.ts` | Notificações Matrix opcionais |
| `src/pm/active.ts` | Runs ativos em `/tmp/taverna-active/` |
| `src/vault/` | Leitura do vault — projetos, tasks, agentes, logbooks, backlinks |
| `src/plugin/` | Interface `TavernaPlugin`, loader, scaffold |
| `src/infra/feature-map.ts` | Registry de features (MCP tools + HTTP routes) |
| `src/server/` | HTTP server (dashboard, flow, SSE, API) |
| `src/mcp/` | MCP server — expõe features para o Claude Code |
| `src/morning/` | Brief matinal com prioridades e logbooks |
| `src/inbox/` | Processa `00_Inbox` com Claude Code |
| `src/migrate/` | Promoção de projetos do archive via Claude Code |
| `src/clockify/` | Sincronização de deep work com Clockify |
| `src/usp/` | Health board das matérias USP |
| `src/notifications/` | Notificador plugável (Matrix, etc.) |

---

## Estrutura do vault (`~/tmp`)

```
10_Projects/
  <id>/
    <id>.md          ← frontmatter do projeto
    tasks/
      <task-id>.md   ← frontmatter: progresso, prioridade, deadline, deps
      archive/       ← tasks concluídas (progresso: 100)
    logbook.md       ← log de execuções do projeto

60_Agents/
  1_Directives/
    <agent>/
      <agent>.md     ← diretiva base do agente
      modes/         ← diretivas especializadas (vhdl, python, teoria…)
      conventions.md ← convenções adicionais
  2_Logbooks/
    <agent>.md       ← log cronológico do agente
  4_Config/
    costs.json       ← ledger de custos (últimos 90 dias)
  5_Inbox/
    YYYYMMdd-morning.md  ← brief matinal
    YYYYMMdd-report.md   ← report de execuções
    <timestamp>-*.md     ← notificações agent-action-required
```

## Frontmatter de projeto (campos relevantes)

```yaml
id: PSI3451
tipo: USP              # USP | BB | *
priority: high         # high | medium | low
agent: '@study-assistant'
run_every: daily       # hourly | daily | weekly | monthly | never
target: 'jvcm@start:tools/taverna/'  # resolvido para /home/jvcm/tools/taverna/
budget_usd_daily: 0.50
pipeline:
  - '@tdd-writer'
  - '@dev-agent'
hostname: mymachine    # opcional — affinity de host
run_window: '09:00-22:00'  # opcional — janela de execução
_last_run: '2026-05-21T17:37:26.689Z'
_last_status: success
_runs_total: 15
# Agendamento customizado:
schedule_compose: inherit   # inherit | override
schedule_steps:
  - agent: '@study-assistant'
    at: '09:00'             # HH:MM | EOD | ausente = qualquer hora
```

## VaultTask (frontmatter em tasks/*.md)

```yaml
progresso: 30
prioridade: high
deadline: 2026-05-23
asset_folder: 05_Aula
depends:
  - 02-outra-task
bloqueio: true
bloqueioDetalhe: "..."
requerHumano:
  - 'Aprovar PR #42'
state: em-progresso
_session_id: <uuid>
_session_started: ...
```

## Tipos de projeto e agentes padrão

| tipo | Agente padrão | Política padrão |
|------|---------------|-----------------|
| `USP` | `@study-assistant` | 09:00, EOD (17h+), qualquer hora |
| `BB` | `@planner` | qualquer hora |
| `*` | `@dev-agent` | qualquer hora |

Projetos podem sobrescrever com `schedule_compose: override` + `schedule_steps`.

---

## Scoring de projetos (`src/pm/scorer.ts`)

Projetos elegíveis são rankeados antes de executar:

| Fator | Peso máx | Detalhes |
|-------|----------|----------|
| Deadline urgency | 100 | `100 - dias_restantes × 10` |
| Priority | 20 | high=20, medium=10, low=0 |
| Health status | 40 | overdue=40, at-risk=25, ok=10 |
| Active tasks | `n × 8` | tasks em building/testing/reviewing |
| Staleness | 30 | `dias_sem_rodar × 5`, cap 30 |
| Deepwork penalty | negativo | `−(horas_semana − 5) × 2` se > 5h |

---

## Task Completion Protocol

Todo agente recebe no prompt um protocolo obrigatório. Ao terminar:
1. Atualizar `progresso:` no frontmatter da task
2. Mover para `tasks/archive/` se `progresso: 100`
3. Appender entrada no `logbook.md` do projeto
4. Terminar com `RESULTADO: <resumo>`

Se precisar de intervenção humana: `ACTION_REQUIRED: <o que precisa>`. O executor escreve em `5_Inbox/` e notifica via Matrix. Retomada com `claude --resume <_session_id>`.

---

## Policy Resolution (`src/pm/policy-resolver.ts`)

```
agent.permissions (directive frontmatter)
  └─ inferProjectTools(project.raw['target'])
       └─ Write, Edit, Read  — sempre que o target existe
       └─ Bash(git *)        — adicional se target/.git existir
```

`bypassPermissions` é o padrão quando o agente não declara `permissions:`. Com `permissions:` declarado → modo `default` com `--allowedTools`.

---

## Budget Guard (`src/pm/budget.ts`)

`budget_usd_daily: <n>` no frontmatter trava execuções ao atingir o limite diário. Custos em `60_Agents/4_Config/costs.json` (ledger 90 dias).

---

## Eventos emitidos (Loki)

```json
{"event":"agent_run","project":"PSI3451","agent":"@study-assistant","status":"success",
 "duration_s":42.3,"tokens_in":12000,"tokens_out":800,
 "cache_read":9000,"cache_fill":3000,"cost_usd":0.0031,"cache_hit_pct":75.0}

{"event":"project_snapshot","project":"PSI3451","tipo":"USP","priority":"high",
 "tasks_total":6,"tasks_done":2,"progresso":33,"health":"at-risk","deadline_days":4}
```

**health:** `overdue` · `at-risk` (deadline < 7d) · `idle` (sem tasks) · `ok`

Custo: Sonnet 4.6 — $3/MTok in · $15/MTok out · $3.75/MTok cache_fill · $0.30/MTok cache_read.

---

## HTTP Server (porta 2948)

```
GET  /dashboard          HTML — cards por projeto
GET  /flow               HTML — máquina de estados de tasks
GET  /api/state          JSON — projetos + health + custos
GET  /api/active         JSON — runs em andamento
GET  /api/costs          JSON — custos do dia
GET  /events             SSE  — connected, update, agent_active
POST /api/run            lança taverna execute
POST /api/run/:id        lança run para projeto :id
```

---

## Comandos CLI

```bash
# Scheduler
taverna execute                           # um tick do scheduler (todos elegíveis)
taverna execute --drain --max-tasks 3     # drain por projeto
taverna schedule                          # daemon contínuo (tick: 60s)
taverna schedule --once                   # um tick e sai
taverna schedule --dry-run                # mostra o que rodaria

# Execução manual
taverna run [agent] --project <id>
taverna run --project <id> --drain
taverna run --project <id> --pipeline
taverna session preview [--project <id>]
taverna session run --project <id> [--tasks t1,t2]

# Políticas
taverna policy [<id>] [--tipo USP]

# Inspeção
taverna status --project <id>
taverna snapshot [--tipo USP] [--dry-run]
taverna plan [--dry-run]
taverna insights

# Conteúdo
taverna morning [--dry-run]
taverna report [--hours <n>] [--dry-run]
taverna inbox [--dry-run]
taverna migrate <archive-path> [--id <id>] [--dry-run]
taverna archive-task <project> <task-id>
taverna backlinks <note>

# Plugins
taverna create-plugin <name> [--with-cli]

# Servidores
taverna serve [--port <n>]
taverna mcp
```

---

## Serviços systemd

```
taverna-server.service    # HTTP Status Server (Restart=always)
taverna-executor.service  # oneshot — taverna execute
taverna-inbox.service     # oneshot — taverna inbox
taverna-morning.service   # oneshot — taverna morning
```

---

## Invariantes importantes

- **Nunca atualizar `_last_run` em falha.** Falhas retentam no próximo ciclo. Só avança em sucesso.
- **O vault é a fonte de verdade.** Nenhum estado em memória — tudo relido a cada execução.
- **`bypassPermissions` é o padrão** quando o agente não declara `permissions:`.
- **tmux para observabilidade.** O executor cria sessões `taverna-<agent>-<project>`, destruídas 3s após o fim.
- **Detecção automática de modo** para `@study-assistant` via regex na task (vhdl, matlab, python, teoria…).
- **Tasks com deps bloqueadas não executam.** O executor retorna `BLOCKED` sem spawnar o agente.
- **Budget não bloqueia permanentemente** — o ledger é diário.
- **Plugins nunca crasham o scheduler.** Erros em `beforeTick`/`afterRun` são logados e ignorados.

## Stack

- TypeScript + Node.js (ESM)
- `commander` — CLI
- `gray-matter` — parse de frontmatter YAML
- `zod` — validação de params de features/MCP
- `vitest` — testes
- Build: `tsc` → `dist/`; instalado via `npm link` ou `npm install -g`
