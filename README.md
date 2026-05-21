# taverna

Orquestrador de projetos vault-first — CLI TypeScript que substitui o `project-manager` Python.

**Stack:** TypeScript · Vitest · gray-matter · commander  
**Vault:** `~/tmp` (configurável via `VAULT_PATH`)

---

## Arquitetura

```
Vault (~/tmp/)
  10_Projects/<project>/        ← projetos com frontmatter
    <project>.md                ← metadata: tipo, priority, agent, runEvery, _last_run
    tasks/<task>.md             ← progresso, prioridade, deadline
  60_Agents/1_Directives/       ← diretivas dos agentes
  60_Agents/2_Logbooks/         ← logs por agente (study-assistant.md, etc.)
  60_Agents/5_Inbox/            ← morning briefs e inbox

taverna CLI
  └─ executor (src/pm/executor.ts)
       ├─ spawn claude-code com prompt construído de (diretiva + projeto + tasks)
       ├─ emite AgentRunPayload → stdout → journal → promtail → Loki
       └─ emite ProjectSnapshotPayload (health) após cada run

Observabilidade (~/.config/observability/)
  Loki ← promtail (scrape: systemd journal do serviço taverna-*)
  Grafana → dashboards/projects.json  (visão geral de agentes)
             dashboards/usp.json      (saúde/prioridade de matérias USP)
```

---

## Tipos de projeto

| tipo | Descrição | Prefixo de pasta |
|------|-----------|-----------------|
| `USP` | Disciplina universitária | PSI, PEA, PEF |
| `BB` | Side project / produto | — |
| `*` | Meta/infra | — |

Detecção automática pelo prefixo da pasta ou pelo campo `tipo:` no frontmatter.

---

## Modelo de dados relevante

### VaultProject (frontmatter)

```yaml
id: PSI3451
tipo: USP
priority: high          # high | medium | low
agent: "@study-assistant"
runEvery: daily         # hourly | daily | weekly | monthly | never
_last_run: 2026-05-21T...
_last_status: success
_runs_total: 42
# USP-específico:
edisciplinas: https://...
horarios: [{dia: "seg", hora: "08:00", local: "Sala X"}]
contatos: ["Prof. Fulano <email>"]
# Agendamento customizado (opcional):
schedule_compose: inherit   # inherit (adiciona ao tipo) | override (substitui)
schedule_steps:
  - agent: "@study-assistant"
    at: "09:00"
```

### VaultTask (frontmatter em tasks/*.md)

```yaml
progresso: 30          # 0-100
prioridade: high       # high | medium | low
deadline: 2026-05-23
asset_folder: 05_Aula  # referência a assets/<N>_Aula/
```

---

## Eventos emitidos (Loki)

### `agent_run` — emitido após cada execução de agente

```json
{
  "event": "agent_run",
  "project": "PSI3451",
  "agent": "@study-assistant",
  "status": "success",
  "duration_s": 42.3,
  "tokens_in": 12000,
  "tokens_out": 800,
  "cache_read": 9000,
  "cache_fill": 3000,
  "cost_usd": 0.0031,
  "cache_hit_pct": 75.0
}
```

### `project_snapshot` — emitido após cada run e pelo comando `snapshot`

```json
{
  "event": "project_snapshot",
  "project": "PSI3451",
  "tipo": "USP",
  "priority": "high",
  "tasks_total": 6,
  "tasks_done": 2,
  "progresso": 33,
  "health": "at-risk",
  "deadline_days": 4
}
```

**health** é calculado automaticamente:
- `overdue` — alguma task pendente tem deadline no passado
- `at-risk` — deadline mais próximo < 7 dias
- `idle` — projeto sem tasks
- `ok` — tudo dentro do prazo

---

## Comandos

```bash
npm run morning        # gera brief em 60_Agents/5_Inbox/YYYYMMdd-morning.md
npm run morning:dry    # imprime no terminal
npm test               # suite de testes
npm run typecheck      # verificação TypeScript
```

```bash
# Inbox
taverna inbox                    # processa 00_Inbox → 40_Archives/projetos-incompletos

# Migração de projetos
taverna migrate <archive-path>   # promove archive → 10_Projects via Claude Code
taverna migrate <path> --dry-run # mostra o prompt sem escrever nada
taverna migrate <path> --id <id> # sobrepõe o ID do projeto

# Asset manager
taverna assets store <project>   # move assets → remoto, cria .asset, atualiza .gitignore
taverna assets pull <project>    # baixa assets faltando (via copyparty)
taverna assets status <project>  # local vs remoto

# Agent executor
taverna run @study-assistant --project PSI3451
taverna execute                  # roda agentes em todos os projetos elegíveis
taverna execute --drain          # roda até esgotar as tasks (≤3 por projeto)

# Inspeção de políticas (leitura, sem executar nada)
taverna policy                   # políticas efetivas de todos os projetos
taverna policy PSI3451           # política de um projeto específico
taverna policy --tipo USP        # filtra por tipo de projeto

# Snapshot de saúde (sem rodar agentes)
taverna snapshot                 # emite project_snapshot para todos os projetos
taverna snapshot --tipo USP      # só matérias USP
taverna snapshot --dry-run       # imprime JSON sem emitir ao Loki

# Clockify deep work
taverna clockify sync            # sincroniza horas → frontmatter dos projetos
taverna clockify status          # mostra horas por projeto (7d)

# Scheduler daemon (substitui systemd timers)
taverna schedule                 # daemon contínuo (tick: 60s)
taverna schedule --once          # roda um tick e sai
```

---

## Módulos

| Módulo | Descrição |
|--------|-----------|
| `src/vault/` | Leitura do vault — projetos, tasks, agentes, logbooks |
| `src/morning/` | Brief matinal com prioridades e logbooks |
| `src/inbox/` | Processa `00_Inbox` com Claude Code |
| `src/assets/` | Ponteiros `.asset` + upload copyparty/gdrive |
| `src/pm/` | Executor, scheduler, policies (TypePolicy defaults), event-bus, health |
| `src/migrate/` | Promoção de projetos do archive via Claude Code |
| `src/clockify/` | Sincronização de deep work com Clockify |

### Event bus (`src/pm/event-bus.ts`)

Padrão atual: `StdoutBus` — JSON lines para stdout, capturado pelo journal do systemd,
ingerido pelo promtail para o Loki.

Placeholder Kafka (`KafkaBus`) já existe no arquivo — trocar `setEventBus()` quando o broker
estiver disponível.

---

## Observabilidade

Stack: **Loki + promtail + Grafana** em `~/.config/observability/`.

| Dashboard | UID | Conteúdo |
|-----------|-----|----------|
| `projects.json` | `project-manager` | Visão geral: runs, taxa de sucesso, tokens, custo |
| `usp.json` | `usp-materias` | Saúde e prioridade das matérias USP |

Para reiniciar a stack após mudanças:
```bash
cd ~/.config/observability && docker compose restart promtail grafana
```

---

## Scheduler — políticas por tipo

Definido em `cli.ts` dentro do comando `schedule`:

```
USP → @study-assistant at 09:00, at EOD, e qualquer hora
BB  → @planner
*   → @dev-agent
```

Projetos podem sobrescrever com `schedule_compose: override` + `schedule_steps` no frontmatter.

---

## Status

| Fase | Status |
|------|--------|
| Phase 1 — Vault + Morning | Concluída |
| Phase 2 — Assets + Executor | Concluída |
| Migrate — Archive → Active | Concluída |
| Phase 3 — Clockify Bridge | Concluída |
| Phase 4 — Observabilidade USP | Concluída |
| Phase 5 — HTTP Server | Planejada |
| Phase 6 — Kafka EventBus | Planejada |

O roadmap completo vive em `10_Projects/taverna/tasks/` no vault.
