# taverna

A headless orchestrator that reads projects from an Obsidian vault, builds context-aware prompts, and spawns [Claude Code](https://claude.ai/code) (`claude` CLI) instances to do real work on each one.

The core metaphor is a **deadpool board**: projects are contracts, agents are specialists, and the scheduler assigns contracts to whoever is eligible at a given moment. A `@dev-agent` works on infra projects, a `@study-assistant` studies course material, a `@planner` handles side projects. Everything runs in the background via systemd, observable through tmux.

## Requirements

- Node.js 20+
- [`claude` CLI](https://claude.ai/code) installed and authenticated
- An Obsidian vault (or any directory following the layout below)

## Installation

```bash
npm install -g taverna
```

Or from source:

```bash
git clone https://github.com/digrao/taverna
cd taverna
npm install
npm run build
npm link
```

## Configuration

Taverna reads configuration from, in order:

1. `~/.config/taverna/.env` — system-level env file
2. `$VAULT_PATH/.env` — vault-local env file
3. Shell environment

The only required variable is `VAULT_PATH`:

```bash
export VAULT_PATH=~/my-vault
```

Optional variables:

| Variable | Description |
|----------|-------------|
| `VAULT_PATH` | Path to your Obsidian vault |
| `TAVERNA_POLICIES` | Path to a `policies.yaml` file (default: `policies.yaml`) |
| `TAVERNA_PLUGINS` | Colon-separated paths to plugin entry points |
| `MATRIX_HOMESERVER` | Matrix homeserver URL for notifications |
| `MATRIX_ROOM_ID` | Matrix room ID |
| `MATRIX_ACCESS_TOKEN` | Matrix access token |

## Vault layout

```
$VAULT_PATH/
  10_Projects/
    <project-id>/
      <project-id>.md       # project frontmatter
      tasks/
        <task-id>.md        # task frontmatter
        archive/            # completed tasks
      logbook.md            # run history

  60_Agents/
    1_Directives/
      <agent>/
        <agent>.md          # agent directive (system prompt)
        modes/              # specialized sub-directives
    2_Logbooks/
      <agent>.md            # chronological agent log
    4_Config/
      costs.json            # daily cost ledger
    5_Inbox/                # action-required notifications
```

### Project frontmatter

```yaml
id: my-project
priority: high              # high | medium | low
agent: '@dev-agent'
run_every: daily            # hourly | daily | weekly | monthly | never
workspace_dir: ~/code/my-project
budget_usd_daily: 0.50
run_window: '09:00-22:00'   # optional time window
```

### Task frontmatter

```yaml
progresso: 30               # 0–100
prioridade: high
deadline: 2026-06-01
depends:
  - other-task-id
```

## Usage

```bash
# Run one scheduler tick (all eligible projects)
taverna execute

# Drain a single project (up to N task iterations)
taverna execute --drain --max-tasks 3

# Run the continuous scheduler daemon (60s tick)
taverna schedule

# Dry-run — show what would run without executing
taverna schedule --dry-run

# Run a specific project manually
taverna run --project <id>

# Inspect project status
taverna status --project <id>

# Show scoring and scheduling plan
taverna plan

# Start the HTTP dashboard (port 2948)
taverna serve

# Start the MCP server
taverna mcp
```

## How scheduling works

Each tick:

1. **Scan** — reads all projects and tasks from the vault
2. **Filter** — skips projects that are not due (`run_every`), outside their `run_window`, or over budget
3. **Rank** — scores eligible projects by deadline urgency, priority, health, active tasks, and staleness
4. **Execute** — for each project in score order, spawns `claude --print` with a built prompt containing the agent directive, active tasks, and the Task Completion Protocol

The agent is expected to:
- Update `progresso:` in the task frontmatter when it makes progress
- Move tasks to `tasks/archive/` when `progresso: 100`
- Append an entry to `logbook.md`
- End its output with `RESULTADO: <summary>` or `ACTION_REQUIRED: <what is needed>`

`_last_run` is only advanced on success — failures retry on the next cycle.

## Project scoring

| Factor | Max | Details |
|--------|-----|---------|
| Deadline urgency | 100 | `100 - days_remaining × 10` |
| Priority | 20 | high=20, medium=10, low=0 |
| Health | 40 | overdue=40, at-risk=25, ok=10 |
| Active tasks | n×8 | tasks in building/testing/reviewing |
| Staleness | 30 | `days_since_run × 5`, capped at 30 |

## HTTP API

When running `taverna serve` (default port 2948):

| Endpoint | Description |
|----------|-------------|
| `GET /dashboard` | Project overview |
| `GET /api/state` | Projects, health, costs (JSON) |
| `GET /api/active` | Currently running agents |
| `GET /events` | SSE stream (connected, update, agent_active) |
| `POST /api/run` | Trigger a scheduler tick |
| `POST /api/run/:id` | Run a specific project |

## Plugin system

Plugins are separate npm packages loaded via `TAVERNA_PLUGINS`:

```bash
export TAVERNA_PLUGINS=/path/to/my-plugin/dist/index.js
```

A plugin exports a default object implementing `TavernaPlugin`:

```ts
import type { TavernaPlugin } from 'taverna/plugin'

export default {
  name: 'my-plugin',

  features: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      schema: z.object({ id: z.string() }),
      handler: async ({ id }, ctx) => { /* ... */ },
    },
  ],

  beforeTick: async (ctx) => { /* runs before each scheduler scan */ },

  afterRun: async (result, project, ctx) => { /* runs after each agent run */ },
} satisfies TavernaPlugin
```

Each feature becomes a MCP tool (`taverna_my_tool`) and an HTTP route (`POST /api/my_tool`) automatically.

## License

MIT
