# Contributing to taverna

## Setup

```bash
git clone https://github.com/digrao/taverna.git
cd taverna
npm install
npm run build
npm link          # makes `taverna` available globally
```

Verify:

```bash
npm run ci        # typecheck + lint + tests — must be green
```

Set a test vault:

```bash
export VAULT_PATH=$HOME/tmp-vault
mkdir -p $VAULT_PATH/10_Projects $VAULT_PATH/60_Agents/1_Directives
taverna session preview   # should return empty list
```

---

## Project structure (frontmatter reference)

A project is a directory `10_Projects/<id>/` with a `README.md`:

```markdown
---
id: my-project
tipo: "*"             # * | USP | BB
priority: medium      # high | medium | low
agent: "@dev-agent"
run_every: daily      # never | daily | weekly | monthly
---

Context the agent reads before starting work.
```

Tasks go in `10_Projects/<id>/tasks/<task-id>.md`:

```markdown
---
prioridade: high      # high | medium | low
progresso: 0          # 0–100
deadline: 2026-06-15  # optional
assignee: human       # optional — human | @agent-name
depends_on:           # optional — blocks this task until deps reach 100%
  - other-task-id
---

# Task title

Instructions for the agent.
```

`assignee: human` — the scheduler never dispatches an agent on this task;
it appears in `taverna inbox` under **humanTasks**.

---

## Community projects as git submodules

Any public repo with a `README.md` in the project frontmatter format qualifies
as a community project. To adopt one into your vault:

```bash
cd my-vault
git submodule add https://github.com/someone/my-project.git 10_Projects/my-project
```

taverna detects the `.git` file (submodule pointer) automatically.
To update all submodules: `taverna sync`.

Minimum frontmatter for a community project `README.md`:

```yaml
id: my-project
tipo: "*"
priority: medium
run_every: never
```

The `agent` field is intentionally omitted — consumers assign their own agent
in their vault config (`agentDefaults` in `taverna.config.yaml`).

---

## Writing a plugin

A plugin is any ES module that exports a `TavernaPlugin` as its default export.
Scaffold one with:

```bash
taverna create-plugin my-feature        # basic
taverna create-plugin my-feature --cli  # with CLI entry point
```

### Minimal plugin

```ts
import type { TavernaPlugin } from 'taverna/plugin'

const plugin: TavernaPlugin = {
  name: 'taverna-my-feature',

  features: [{
    name: 'my_check',
    description: 'Returns vault path',
    params: {},
    httpMethod: 'GET',
    httpPath: '/api/my-feature/check',
    handler: async (_, ctx) => ({ vault: ctx.vaultPath }),
  }],
}

export default plugin
```

### Scheduling plugin — override scoring

```ts
import type { TavernaPlugin } from 'taverna/plugin'
import type { ScoredProject } from 'taverna/pm'

const plugin: TavernaPlugin = {
  name: 'taverna-my-scorer',

  scheduling: {
    scoring: {
      score(project, agentId, ctx) {
        // custom scoring logic
        return { project, agentId, score: 42, factors: [] }
      },
      rank(projects, agentDefaults, ctx) {
        return projects
          .map(p => this.score(p, agentDefaults[p.tipo] ?? '', ctx))
          .sort((a, b) => b.score - a.score)
      },
    },
  },
}

export default plugin
```

Each scheduling slot (`scoring`, `triage`, `permissions`) is independent —
omit the ones you don't need. The last loaded plugin wins per slot.

### Lifecycle hooks

```ts
const plugin: TavernaPlugin = {
  name: 'taverna-my-hooks',

  onLoad(bus) {
    bus.addSink({
      name: 'my-sink',
      send: async (msg) => { /* forward to slack, etc. */ },
    })
  },

  async beforeTick(ctx) {
    // called once before each scheduler scan — good for pre-sync work
  },

  async afterRun(result, project, ctx) {
    // called after each agent run — good for telemetry or asset uploads
  },
}
```

### Raw HTTP routes (non-JSON content)

```ts
const plugin: TavernaPlugin = {
  name: 'taverna-my-ui',
  httpRoutes: [{
    method: 'GET',
    path: '/my-ui',
    handler: async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h1>hello</h1>')
    },
  }],
}
```

### Register the plugin

```bash
TAVERNA_PLUGINS=/path/to/dist/index.js taverna serve
# or in ~/.config/taverna/.env:
TAVERNA_PLUGINS=/path/to/dist/index.js
```

---

## CI requirements

Every commit must pass:

```bash
npm run ci   # typecheck + lint + tests
```

- No `--no-verify` bypasses
- One logical change per commit
- Commit message format: `<type>(<scope>): <summary>`
  - Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `ci`

---

## Project layout

```
src/
  commands/      single source of truth for all commands
  infra/         HTTP server, MCP server, feature-map adapter
  pm/
    engine/      scheduler, executor, drain loop
    observability/ budget, loki, active-runs
    prompt/      prompt builder, snapshots
    scheduling/  scoring, triage, policies, plugin interfaces
  plugin/        loader, scaffold, types
  vault/         frontmatter parsing, project/task/agent readers
```
