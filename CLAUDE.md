# Taverna — CLAUDE.md

## O que é este projeto

Taverna é um **orquestrador de agentes Claude Code** — um motor que lê projetos de um vault Obsidian, constrói prompts com contexto preciso e spawna instâncias do `claude` CLI para executar trabalho real em cada projeto.

A metáfora central é um **deadpool de taverna**: projetos são contratos, agentes são mercenários, e o executor é o dono que distribui os contratos para quem é elegível no momento. O `@dev-agent` trabalha em projetos de infra, o `@study-assistant` estuda matérias da USP, o `@planner` cuida de side projects.

Não é um chatbot. Não tem interface interativa. É um sistema de automação headless que roda em segundo plano via systemd, mas pode ser acessado via tmux.

## Fonte de verdade

O vault vive em `~/tmp` (configurável via `VAULT_PATH`). A descrição do projeto taverna está em:
```
~/tmp/10_Projects/taverna/taverna.md
```

Este CLAUDE.md é a referência interna autoritativa para agentes que vão modificar o código. O README.md no repo é um stub que aponta para cá.

## Arquitetura em camadas

```
systemd timers
  └─ taverna execute / taverna schedule
       └─ executor.ts — spawna `claude --print --output-format json`
            ├─ prompt.ts — constrói o prompt (diretiva + tasks + contexto)
            ├─ loki.ts — emite eventos JSON (agent_run, project_snapshot)
            ├─ budget.ts — guarda orçamento diário por projeto
            ├─ active.ts — registra runs ativos em /tmp/taverna-active/
            ├─ matrix.ts — notificações Matrix opcionais
            └─ vault/ — lê projetos, tasks, agentes do sistema de arquivos

taverna serve (porta 2948, always-on)
  └─ server/routes.ts — HTTP + SSE
       ├─ dashboard.ts — HTML com cards por projeto
       └─ flow.ts — máquina de estados de tasks
```

### Fluxo de execução de um agente

1. `scanVault` lê todos os projetos em `10_Projects/` e agentes em `60_Agents/1_Directives/`
2. `isProjectDue` verifica se o projeto precisa rodar (baseado em `run_every` e `_last_run`)
3. `checkBudget` verifica se o projeto não excedeu `budget_usd_daily`
4. `buildPrompt` monta o prompt: diretiva do agente + Task Completion Protocol + tasks pendentes + contexto
5. `spawnClaude` executa `claude --print --output-format json` com o prompt via stdin
6. O resultado é parseado, tokens contados, custo calculado, evento `agent_run` emitido
7. `updateProjectStatus` atualiza `_last_run`, `_last_status`, `_runs_total` no frontmatter do projeto
8. `appendLogbook` registra o resultado no logbook do agente em `60_Agents/2_Logbooks/`

### Pipeline de agentes

É possível encadear agentes em sequência via `runPipeline`. O output de cada agente é passado como `previousOutput` para o próximo — ativado via `taverna run --pipeline` quando `pipeline:` está declarado no frontmatter:
```
@tdd-writer → @dev-agent → @reviewer
```

## Estrutura do vault (`~/tmp`)

```
10_Projects/
  <id>/
    <id>.md          ← frontmatter do projeto (tipo, priority, agent, run_every, _last_run)
    tasks/
      <task-id>.md   ← frontmatter: progresso (0-100), prioridade, deadline
      archive/       ← tasks concluídas (progresso: 100)
    logbook.md       ← log de execuções do projeto

60_Agents/
  1_Directives/
    <agent>/
      <agent>.md     ← diretiva base do agente
      modes/         ← diretivas especializadas (vhdl.md, python.md, teoria.md...)
      conventions.md ← convenções adicionais (incluídas automaticamente)
  2_Logbooks/
    <agent>.md       ← log cronológico do agente
  4_Config/
    costs.json       ← ledger de custos (últimos 90 dias)
  5_Inbox/
    YYYYMMdd-morning.md  ← brief matinal gerado por `taverna morning`
    YYYYMMdd-report.md   ← report de execuções
    <timestamp>-*.md     ← notificações agent-action-required
```

## Tipos de projeto e agentes padrão

| tipo | Agente padrão | Política de horário |
|------|---------------|---------------------|
| `USP` | `@study-assistant` | 09:00, EOD (17h+), e qualquer hora |
| `BB` | `@planner` | qualquer hora |
| `*` | `@dev-agent` | qualquer hora |

Projetos podem sobrescrever com `schedule_compose: override` + `schedule_steps` no frontmatter.

## Frontmatter de projeto (campos relevantes)

```yaml
id: PSI3451
tipo: USP              # USP | BB | *
priority: high         # high | medium | low
agent: '@study-assistant'
run_every: daily       # hourly | daily | weekly | monthly | never
target: 'jvcm@start:tools/taverna/'  # resolvido para /home/jvcm/tools/taverna/
budget_usd_daily: 0.50 # opcional — trava execuções ao atingir o limite diário
pipeline:              # opcional — encadeia agentes em sequência
  - '@tdd-writer'
  - '@dev-agent'
_last_run: '2026-05-21T17:37:26.689Z'
_last_status: success  # success | failed
_runs_total: 15
# Agendamento customizado:
schedule_compose: inherit   # inherit (adiciona ao tipo) | override (substitui)
schedule_steps:
  - agent: '@study-assistant'
    at: '09:00'
```

O campo `target` é resolvido pelo executor (`resolveTarget` em `prompt.ts`) e injetado no prompt como `**Target:** /home/jvcm/...`.

## VaultTask (frontmatter em tasks/*.md)

```yaml
progresso: 30          # 0-100
prioridade: high       # high | medium | low
deadline: 2026-05-23
asset_folder: 05_Aula  # referência a assets/<N>_Aula/
depends:               # IDs de tasks que devem ser concluídas antes
  - 02-outra-task
bloqueio: true         # task impedida por fator externo
bloqueioDetalhe: "..."
requerHumano:          # ações necessárias do humano
  - 'Aprovar PR #42'
state: em-progresso    # backlog | tarefinha | tarefa | em-progresso |
                       # aguardando_humano | bloqueada | concluida
_session_id: <uuid>    # preenchido pelo executor ao iniciar a task
_session_started: ...  # timestamp de início da sessão
```

## Task Completion Protocol

Todo agente recebe no prompt um protocolo obrigatório de conclusão de tasks. Ao terminar uma task, o agente deve:
1. Atualizar `progresso:` no frontmatter da task
2. Mover para `tasks/archive/` se `progresso: 100`
3. Appender entrada no `logbook.md` do projeto no vault
4. Terminar o response com `RESULTADO: <resumo>`

O `RESULTADO:` é parseado pelo executor e salvo no logbook do agente.

Se o agente precisar de intervenção humana antes de concluir, termina com `ACTION_REQUIRED: <o que precisa>`. O executor escreve um arquivo em `60_Agents/5_Inbox/` e notifica via Matrix (se configurado). O humano pode retomar com `claude --resume <_session_id>`.

## Comandos

```bash
# Executor
taverna run [agent] --project <id>        # roda um agente em um projeto
taverna run --project <id> --drain        # drain sequencial até esgotar tasks
taverna run --project <id> --pipeline     # executa pipeline declarado no frontmatter
taverna execute                           # roda em todos os projetos elegíveis
taverna execute --drain                   # drain em todos elegíveis (≤3 tasks cada)
taverna execute --max-tasks <n>           # controla o limite do drain

# Scheduler daemon (substitui systemd timers)
taverna schedule                          # daemon contínuo (tick: 60s)
taverna schedule --once                   # um tick e sai
taverna schedule --dry-run                # mostra o que rodaria sem executar

# Inspeção de políticas (leitura, sem executar nada)
taverna policy                            # políticas efetivas de todos os projetos
taverna policy <id>                       # política de um projeto específico
taverna policy --tipo USP                 # filtra por tipo

# Snapshot de saúde
taverna snapshot                          # emite project_snapshot para todos
taverna snapshot --tipo USP               # filtra por tipo
taverna snapshot --dry-run                # imprime JSON sem emitir ao Loki

# Status de dependências de tasks
taverna status --project <id>             # mostra quais tasks estão bloqueadas por deps

# Morning brief
taverna morning                           # gera brief em 60_Agents/5_Inbox/YYYYMMdd-morning.md
taverna morning --dry-run                 # imprime no terminal

# Report de execuções
taverna report                            # resume as últimas 24h → 5_Inbox/YYYYMMdd-report.md
taverna report --hours <n>                # janela customizada
taverna report --dry-run                  # imprime sem escrever

# Plano geral
taverna plan                              # agrega tasks pendentes → vault root/STATUS.md
taverna plan --dry-run                    # imprime sem escrever

# Insights do vault
taverna insights                          # emite vault_snapshot (inbox/zettelkasten/projetos)

# Inbox
taverna inbox                             # processa 00_Inbox → 40_Archives
taverna inbox --dry-run                   # mostra o prompt sem processar

# Tasks
taverna archive-task <project> <task-id>  # marca task como concluída e arquiva

# Migração de projetos arquivados
taverna migrate <archive-path>            # promove archive → 10_Projects via Claude Code
taverna migrate <path> --dry-run          # mostra o prompt sem escrever
taverna migrate <path> --id <id>          # sobrepõe o ID do projeto

# Assets
taverna assets store <project>            # move assets → remoto, cria .asset pointer
taverna assets pull <project>             # baixa assets faltando
taverna assets status <project>           # local vs remoto

# Clockify deep work
taverna clockify sync                     # sincroniza horas → frontmatters dos projetos
taverna clockify status                   # mostra horas por projeto (últimos 7d)

# USP health board
taverna usp-board                         # atualiza 20_Areas/2_Estudos/Escola Politécnica.md
taverna usp-board --dry-run               # imprime o bloco sem escrever

# Backlinks
taverna backlinks <note>                  # encontra todos os arquivos que linkam para a nota

# HTTP Status Server
taverna serve                             # porta padrão 2948
taverna serve --port <n>                  # porta customizada
```

## HTTP Server (porta 2948)

```
GET  /dashboard          HTML — cards por projeto com health, custos e botões de ação
GET  /flow               HTML — máquina de estados de tasks + tabela de projetos + deps
GET  /api/state          JSON — projetos com health calculado + custos do dia
GET  /api/active         JSON — runs em andamento agora (de /tmp/taverna-active/)
GET  /api/costs          JSON — custos do dia por projeto + total
GET  /status             JSON — contagem de projetos/agentes (leve)
GET  /projects           JSON — lista de projetos
GET  /projects/:id       JSON — projeto por ID
GET  /agents             JSON — lista de agentes
GET  /inbox              JSON — itens agent-action-required no 00_Inbox
GET  /backlinks?note=... JSON — backlinks da nota
GET  /events             SSE  — stream: connected, update, agent_active
POST /api/run            lança `taverna execute` em background
POST /api/drain          lança `taverna execute --drain` em background
POST /api/run/:id        lança run para o projeto :id
```

O server lê o vault via cache com TTL e emite `update` via SSE quando o cache é invalidado. Mudanças em `/tmp/taverna-active/` são propagadas como `agent_active`.

## Eventos emitidos (Loki)

### `agent_run`
```json
{"event":"agent_run","project":"PSI3451","agent":"@study-assistant","status":"success",
 "duration_s":42.3,"tokens_in":12000,"tokens_out":800,
 "cache_read":9000,"cache_fill":3000,"cost_usd":0.0031,"cache_hit_pct":75.0}
```

### `project_snapshot`
```json
{"event":"project_snapshot","project":"PSI3451","tipo":"USP","priority":"high",
 "tasks_total":6,"tasks_done":2,"progresso":33,"health":"at-risk","deadline_days":4}
```

**health:** `overdue` (task vencida) · `at-risk` (deadline < 7d) · `idle` (sem tasks) · `ok`

### `vault_snapshot`
```json
{"event":"vault_snapshot","inbox":3,"zettelkasten":42,"projects":12}
```

Custo calculado com preços do Sonnet 4.6: $3/MTok in · $15/MTok out · $3.75/MTok cache_fill · $0.30/MTok cache_read.

## Observabilidade

Eventos são emitidos como JSON lines para stdout → capturado pelo journal do systemd → ingerido pelo promtail → Loki → Grafana (`:3000`).

Para trocar para Kafka no futuro: substituir `StdoutBus` por `KafkaBus` em `src/pm/event-bus.ts` via `setEventBus()`. O placeholder já existe.

## Serviços systemd

```
taverna-server.service    # HTTP Status Server na porta 2948 — sempre ligado (Restart=always)
taverna-executor.service  # oneshot — roda taverna execute
taverna-inbox.service     # oneshot — roda taverna inbox
taverna-morning.service   # oneshot — roda taverna morning
```

O server fica always-on. Os outros são disparados por timers (ver `activate-timers.sh`).

## Policy Resolution (`src/pm/policy-resolver.ts`)

As permissões do agente são resolvidas em cadeia de escopo, do mais geral ao mais específico:

```
agent.permissions (directive frontmatter)
  └─ inferProjectTools(project.raw['target'])
       └─ Write, Edit, Read  — sempre que o target existe
       └─ Bash(git *)        — adicional se target/.git existir
```

**Regra crítica:** inferência só ocorre quando o agente JÁ tem `permissions:` declarado. Se o agente não declara permissões, `bypassPermissions` continua em vigor.

`resolvePolicy(agent, project)` retorna `ResolvedPolicy` com:
- `permissionMode` — `'bypassPermissions'` ou `'default'`
- `allowedTools` — lista efetiva para `--allowedTools`
- `agentTools` / `inferredTools` — breakdown por origem (visível em `taverna policy`)

## Budget Guard (`src/pm/budget.ts`)

Se o frontmatter do projeto tiver `budget_usd_daily: <n>`, o executor checa antes de spawnar o agente. Se o custo acumulado do dia atingiu o limite, a execução falha com `BUDGET: ...` sem consumir tokens.

Custos são registrados em `60_Agents/4_Config/costs.json` (ledger JSON, 90 dias de retenção) após cada run bem-sucedido.

## Matrix Notifications (`src/pm/matrix.ts`)

Configurado via variáveis de ambiente (opcionais):
```
MATRIX_HOMESERVER     https://matrix.example.org
MATRIX_ROOM_ID        !roomid:matrix.example.org
MATRIX_ACCESS_TOKEN   syt_...
```

O executor envia mensagem ao room após conclusão (`[taverna] ✓ @agent concluiu projeto`) ou ao detectar `ACTION_REQUIRED` (`[taverna] ⚠ @agent aguarda input` + `claude --resume <session_id>`).

## Active Runs (`src/pm/active.ts`)

Enquanto um agente está rodando, um arquivo JSON é escrito em `/tmp/taverna-active/<project>.json`:
```json
{"project":"taverna","agent":"@dev-agent","sessionId":"...","startedAt":"..."}
```

Removido ao terminar (sucesso ou falha). O server observa esse diretório e emite `agent_active` via SSE.

## Sessão Claude e Intervenção Humana

Antes de spawnar o agente, o executor:
1. Gera um `sessionId` (UUID)
2. Escreve `_session_id` e `_session_started` no frontmatter das tasks pendentes
3. Passa `--session-id` para o `claude`, permitindo `claude --resume <sessionId>`

Após o run, tarefas concluídas (progresso ≥ 100) têm o `_session_id` atualizado na versão arquivada.

## Módulos

| Módulo | Descrição |
|--------|-----------|
| `src/vault/` | Leitura do vault — projetos, tasks, agentes, logbooks, backlinks |
| `src/morning/` | Brief matinal com prioridades e logbooks |
| `src/inbox/` | Processa `00_Inbox` com Claude Code |
| `src/assets/` | Ponteiros `.asset` + upload copyparty/gdrive |
| `src/pm/` | Executor, scheduler, policies, event-bus, health, budget, matrix, active runs |
| `src/migrate/` | Promoção de projetos do archive via Claude Code |
| `src/clockify/` | Sincronização de deep work com Clockify |
| `src/usp/` | Health board das matérias USP |
| `src/server/` | HTTP server (dashboard, flow, SSE, API) |

## Invariantes importantes

- **Nunca atualizar `_last_run` em falha.** Falhas devem retentar no próximo ciclo. Só avança em sucesso.
- **O vault é a fonte de verdade.** Nenhum estado em memória ou banco — tudo lido do sistema de arquivos a cada execução.
- **`bypassPermissions` é o padrão** quando o agente não declara `permissions:` no frontmatter. Agentes com `permissions:` usam modo `default` com `--allowedTools`.
- **tmux para observabilidade ao vivo.** O executor cria sessões tmux `taverna-<agent>-<project>`. Sessões são destruídas 3s após o término.
- **Detecção automática de modo** para `@study-assistant`: a task é analisada por regex para detectar o modo (vhdl, matlab, embarcados, python, teoria) e a diretiva de `modes/` correspondente é incluída.
- **Tasks com dependências bloqueadas não executam.** Se todas as tasks pendentes têm deps insatisfeitas, o executor retorna `BLOCKED` sem spawnar o agente.
- **Budget não bloqueia permanentemente** — o ledger é diário; o projeto volta a rodar no dia seguinte.

## Stack

- TypeScript + Node.js (ESM)
- `commander` — CLI
- `gray-matter` — parse de frontmatter YAML
- `vitest` — testes
- Build: `tsc` → `dist/`; instalado globalmente via `npm link` ou `npm install -g`
