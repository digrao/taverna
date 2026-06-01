# taverna

A headless orchestrator that reads projects from an Obsidian vault, builds context-aware prompts, and spawns [Claude Code](https://claude.ai/code) (`claude` CLI) instances to work on them.

The core metaphor is a **deadpool board**: projects are contracts, agents are specialists, and the scheduler assigns contracts to whoever is eligible at a given moment. A `@dev-agent` works on software projects, a `@study-assistant` processes course material. Everything runs in the background via systemd, observable through tmux and an HTTP dashboard.

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
npm install && npm run build && npm link
```

## Configuration

Taverna reads from, in order:

1. `~/.config/taverna/.env`
2. `$VAULT_PATH/.env`
3. Shell environment

The only required variable is `VAULT_PATH`:

```bash
export VAULT_PATH=~/my-vault
```

| Variable | Description |
|---|---|
| `VAULT_PATH` | Path to your Obsidian vault |
| `TAVERNA_PLUGINS` | Colon-separated paths to plugin entry points |
| `TAVERNA_NOTIFIER` | Set to `none` to silence console notifications |
| `MATRIX_HOMESERVER` | Matrix homeserver URL for notifications |
| `MATRIX_ROOM_IDS` | Comma-separated Matrix room IDs |
| `MATRIX_ACCESS_TOKEN` | Matrix access token |

## Vault layout

```
$VAULT_PATH/
  10_Projects/
    <project-id>/
      <project-id>.md       # project frontmatter + context body
      tasks/
        <task-id>.md        # task with frontmatter
        archive/            # completed tasks land here automatically
      logbook.md            # agent run history

  60_Agents/
    1_Directives/
      @my-agent/
        @my-agent.md        # system prompt / directive
    2_Logbooks/
      @my-agent.md          # chronological run log
    4_Config/
      costs.json            # daily cost ledger
    5_Inbox/                # action-required notifications from agents
```

### Project frontmatter

```yaml
---
id: my-project
priority: high            # high | medium | low
agent: '@my-agent'
run_every: daily          # hourly | daily | weekly | monthly | never
workspace_dir: ~/code/my-project
budget_usd_daily: 0.50
run_window: '09:00-22:00'
---
Project context written here is included in every agent prompt.
```

### Task frontmatter

```yaml
---
progresso: 30             # 0–100; 100 = done
prioridade: high          # high | medium | low
deadline: 2026-06-15
depends:
  - other-task-id         # blocks this task until the dep reaches 100%
---
Task description and context for the agent.
```

Tasks at `progresso: 100` are automatically moved to `tasks/archive/` after each session.

### Agent directive

An agent's directive is the system prompt sent to Claude before any task context. Place it at:

```
60_Agents/1_Directives/@my-agent/@my-agent.md
```

Frontmatter fields supported:

```yaml
---
description: What this agent does
runner:
  type: claude        # claude | ollama
permissions: []       # tool allowlist — omit to bypass all permissions
---
You are a specialist in …
```

---

## CLI reference

### `taverna work`

One-shot dispatch: scans the vault, selects eligible projects, runs agents, exits.

```bash
taverna work
taverna work --dry-run            # show what would run without executing
taverna work --drain              # run tasks per project until queue is empty
taverna work --drain --max-tasks 5
```

### `taverna session`

Batch multiple tasks into one context window to maximise Claude's prompt cache hit rate.

```bash
# Preview eligible tasks across all projects
taverna session preview
taverna session preview --project my-project

# Run a batched session
taverna session run --project my-project
taverna session run --project my-project --tasks task-01,task-03
taverna session run --project my-project --dry-run
```

After a session completes, tasks that reached `progresso: 100` are archived automatically and the project's `_last_run` / `_last_status` are updated.

### `taverna run`

Run a single agent on a specific project.

```bash
taverna run --project my-project
taverna run --project my-project --dry-run
taverna run --project my-project --drain    # keep running until no tasks remain
taverna run --project my-project --pipeline # run agents in project.pipeline order
```

### `taverna serve`

Start the HTTP dashboard (default port 2948).

```bash
taverna serve
taverna serve --port 3000
```

### `taverna mcp`

Start a stdio MCP server exposing all taverna tools to Claude.

```bash
taverna mcp
```

### `taverna policy`

Inspect effective scheduling policy and permission mode for projects.

```bash
taverna policy
taverna policy my-project
```

### `taverna status`

Show task dependency graph for a project.

```bash
taverna status --project my-project
```

### `taverna plan`

Aggregate pending tasks across all projects and write `STATUS.md` to the vault root.

```bash
taverna plan
taverna plan --dry-run
```

### `taverna archive-task`

Manually mark a task as done and move it to `archive/`.

```bash
taverna archive-task my-project task-01
```

### `taverna migrate`

Promote an archived folder to `10_Projects/` using Claude to synthesise notes into project + task files.

```bash
taverna migrate path/to/old-folder
taverna migrate path/to/old-folder --id new-id --dry-run
```

### `taverna report`

Write a summary of the last 24h of agent runs to `60_Agents/5_Inbox/`.

```bash
taverna report
taverna report --hours 48 --dry-run
```

### `taverna create-plugin`

Scaffold a new plugin package.

```bash
taverna create-plugin my-feature
taverna create-plugin my-feature --with-cli
```

---

## HTTP API

`taverna serve` runs on port 2948.

### Pages

| Route | Description |
|---|---|
| `GET /dashboard` | Project overview |
| `GET /flow` | Task state machine view |
| `GET /run/:id` | Live session view with task selector |

### JSON API

| Route | Description |
|---|---|
| `GET /api/state` | All projects with health, costs |
| `GET /api/active` | Currently running sessions |
| `GET /api/costs` | Today's cost breakdown |
| `GET /api/budget` | Token + USD budget status |
| `GET /projects` | List all projects |
| `GET /projects/:id` | Single project with tasks |
| `GET /agents` | Available agents |
| `GET /inbox` | Pending action-required items |
| `GET /backlinks?note=...` | Vault notes linking to a note |
| `GET /api/session/preview` | Eligible tasks per project |
| `GET /api/prompt/:id` | Dry-run session prompt |
| `GET /api/prompt/:id/history` | Prompt snapshot history |
| `POST /api/run` | Trigger `taverna work` |
| `POST /api/drain` | Trigger `taverna work --drain` |
| `POST /api/run/:id` | Run a specific project |
| `POST /api/session/run` | Run a batched session `{ project, tasks? }` |

### SSE streams

| Route | Description |
|---|---|
| `GET /events` | Global: `connected`, `update`, `agent_active` |
| `GET /run/:id/events` | Per-project: `idle`, `agent_active`, `agent_log`, `agent_done` |

---

## Scheduling

`taverna work` is stateless and one-shot — cadence is handled externally (systemd timer, cron).

Each tick:

1. **Scan** — reads all projects and tasks from the vault
2. **Filter** — skips projects with `run_every: never`, outside their `run_window`, or over budget
3. **Rank** — scores eligible projects by deadline urgency, priority, health, active tasks, staleness
4. **Dispatch** — for each project, spawns `claude --print` with a prompt containing the agent directive + active tasks

The agent is expected to:
- Write progress to `progresso:` in task frontmatter
- End output with `RESULTADO: <summary>` or `ACTION_REQUIRED: <what is needed>`

`_last_run` advances only on success — failures retry on the next tick.

---

## Plugin system

Plugins extend taverna with new MCP tools, HTTP routes, CLI commands, and lifecycle hooks. Each plugin is a separate npm package.

### Creating a plugin

```bash
taverna create-plugin my-feature
cd taverna-my-feature
npm install && npm run build
```

Register the built entry point:

```bash
# add to ~/.config/systemd/user/taverna-server.service.d/plugins.conf
Environment="TAVERNA_PLUGINS=/path/to/taverna-my-feature/dist/index.js"
```

Multiple plugins are colon-separated:

```
Environment="TAVERNA_PLUGINS=/path/to/plugin-a/dist/index.js:/path/to/plugin-b/dist/index.js"
```

### Plugin interface

```ts
import type { TavernaPlugin } from 'taverna/plugin'
import type { NotificationBus } from 'taverna/notifications'

const plugin: TavernaPlugin = {
  name: 'my-feature',

  // ── Features ──────────────────────────────────────────────────────────────
  // Each FeatureDef becomes an MCP tool AND an HTTP route automatically.
  features: [
    {
      name: 'my_tool',                   // MCP tool name + /api/my_tool
      description: 'Does something useful',
      params: { id: z.string() },        // Zod schema
      httpMethod: 'GET',
      httpPath: '/api/my/tool/:id',      // optional override
      handler: async ({ id }, ctx) => {
        // ctx.vaultPath — absolute path to vault
        // ctx.config    — TavernaConfig
        // ctx.scan?.()  — cached vault scanner (HTTP) or undefined (MCP)
        return { result: id }
      },
    },
  ],

  // ── Raw HTTP routes ────────────────────────────────────────────────────────
  // For serving HTML, static files, or any non-JSON response.
  httpRoutes: [
    {
      method: 'GET',
      path: '/my-plugin/ui',
      handler: async (req, res, path) => {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h1>hello</h1>')
      },
    },
  ],

  // ── Notification bus ──────────────────────────────────────────────────────
  // Register notifiers (Matrix, Slack, …) without modifying core.
  onLoad: (bus: NotificationBus) => {
    bus.register({
      async send(msg) { /* forward msg to your notification backend */ },
    })
  },

  // ── CLI commands ──────────────────────────────────────────────────────────
  registerCommands: (program, ctx) => {
    program
      .command('my-cmd')
      .description('My plugin command')
      .action(async () => { /* ... */ })
  },

  // ── Scheduler hooks ───────────────────────────────────────────────────────
  beforeTick: async (ctx) => {
    // runs once before each vault scan + dispatch cycle
  },

  afterRun: async (result, project, ctx) => {
    // runs after each agent run completes (not in dry-run mode)
  },
}

export default plugin
```

### Notification bus

To send a notification from inside any feature handler or hook:

```ts
import { notificationBus } from 'taverna/notifications'

notificationBus.send({
  text: 'Something happened',
  urgency: 'info',     // 'info' | 'warning' | 'critical'
  project: 'my-proj',  // optional — used for room filtering
  agent: '@my-agent',  // optional
})
```

To plug in Matrix, use the built-in `MatrixNotifier` in your plugin's `onLoad`:

```ts
import { matrixNotifierFromEnv } from 'taverna/notifications'

onLoad: (bus) => {
  const notifier = matrixNotifierFromEnv()
  if (notifier) bus.register(notifier)
}
```

`matrixNotifierFromEnv()` reads `MATRIX_HOMESERVER`, `MATRIX_ROOM_IDS`, and `MATRIX_ACCESS_TOKEN` and uses native `fetch` — no extra dependencies.

### Testing plugins

Handlers are pure async functions. Pass a fake `ctx` and assert on the return value:

```ts
import { describe, it, expect } from 'vitest'
import plugin from '../src/index.js'

const ctx = {
  vaultPath: '/tmp/test-vault',
  config: { vaultPath: '/tmp/test-vault' } as any,
}

describe('my_tool', () => {
  it('returns result', async () => {
    const f = plugin.features!.find(f => f.name === 'my_tool')!
    expect(await f.handler({ id: 'abc' }, ctx)).toEqual({ result: 'abc' })
  })
})
```

---

## License

MIT
