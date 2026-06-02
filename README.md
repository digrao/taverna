# taverna

> *Vontade é a condição necessária e suficiente para fazer a realidade.*

A headless orchestrator that reads projects from an Obsidian vault, builds context-aware prompts, and runs [Claude Code](https://claude.ai/code) sessions on them.

The core metaphor is a **deadpool board**: projects are contracts, agents are specialists, and the scheduler assigns work to whoever is eligible. A `@dev-agent` works on software, a `@study-assistant` processes course material. Everything runs in the background via systemd, observable through an HTTP dashboard.



## Quick start

### 1 — Install

**Build from source** (requires Node.js 22+ and the [Claude Code CLI](https://claude.ai/code) for agent execution)

```bash
git clone https://github.com/digrao/taverna.git
cd taverna
npm install && npm run build
npm link
```

**Docker** (dashboard + read-only commands; agent execution requires `claude` CLI inside the container)

```bash
export VAULT_PATH=$HOME/my-vault
docker compose up          # dashboard → http://localhost:2948/dashboard
```

---

### 2 — Configure the vault

Point taverna at your Obsidian vault by adding `VAULT_PATH` to `~/.config/taverna/.env`:

```bash
mkdir -p ~/.config/taverna
echo "VAULT_PATH=$HOME/my-vault" >> ~/.config/taverna/.env
```

Taverna expects this layout inside the vault:

```
my-vault/
  10_Projects/        ← one directory per project
  60_Agents/
    1_Directives/     ← agent instruction folders
    2_Logbooks/       ← auto-created by taverna
```

---

### 3 — Create a project

Each project is a directory containing a `README.md` with frontmatter in `10_Projects/<id>/README.md`:

```markdown
---
id: my-project
tipo: "*"
agent: "@dev-agent"
priority: medium
run_every: never
---

Project description and context for the agent.
```

Key frontmatter fields:

| Field | Values | Notes |
|---|---|---|
| `id` | string | Unique identifier |
| `tipo` | `*` \| `USP` \| `BB` | Project type; `*` = general |
| `agent` | `@agent-name` | Which directive to use |
| `priority` | `high` \| `medium` \| `low` | Scheduling weight |
| `run_every` | `never` \| `daily` \| `weekly` \| `monthly` | How often to dispatch |

Tasks go in `10_Projects/<id>/tasks/<task-id>.md`:

```markdown
---
id: my-first-task
title: "Implement X"
progresso: 0
---

Detailed instructions for the agent.
```

#### Collaborative projects

A project directory can be its own git repository — or registered as a git submodule in the vault:

```bash
# init a project as a standalone repo
cd 10_Projects/my-project && git init && git remote add origin <url>

# register it as a submodule (optional, for shared vaults)
cd my-vault && git submodule add <url> 10_Projects/my-project
```

When a project directory contains a `.git` entry, taverna marks it as `isGitRepo: true` and infers git tool permissions for the agent automatically.

---

### 4 — Create an agent directive

Directives live in `60_Agents/1_Directives/<name>/directives.md`.
Agents **must** declare explicit `permissions:` — this is the security boundary for what tools the agent may invoke:

```markdown
---
name: "@dev-agent"
description: "Full-stack developer — implements tasks, commits, and pushes"
runner: claude
permissions:
  - Read
  - Write
  - Edit
  - Bash(git add *)
  - Bash(git commit *)
  - Bash(git push *)
---

# Instructions

You implement the next pending task. Validate locally and push to the remote.
```

Agents without `permissions:` run in bypass mode (all tools allowed). Prefer the explicit list.

---

### 5 — Run

```bash
taverna session preview          # list projects with pending tasks
taverna work                     # dispatch agents (requires claude CLI)
taverna serve                    # HTTP dashboard → http://localhost:2948/dashboard
```

## Documentation

Full documentation lives in the [wiki](https://github.com/digrao/taverna/wiki):

- [Getting Started](https://github.com/digrao/taverna/wiki/Getting-Started) — installation, vault layout, configuration
- [CLI Reference](https://github.com/digrao/taverna/wiki/CLI-Reference) — all commands and flags
- [HTTP API](https://github.com/digrao/taverna/wiki/HTTP-API) — dashboard, JSON endpoints, SSE streams
- [Scheduling](https://github.com/digrao/taverna/wiki/Scheduling) — systemd timer, `run_every`, budget
- [Plugin System](https://github.com/digrao/taverna/wiki/Plugin-System) — `TavernaPlugin` interface, `NotificationBus`
- [Plugins](https://github.com/digrao/taverna/wiki/Plugins) — available plugins (`taverna-assets`, ...)

## Plugins

Plugins extend taverna with new MCP tools, HTTP routes, CLI commands, and scheduling behaviour — without touching the core.

Scaffold a new plugin:

```bash
taverna create-plugin my-feature
```

### Features (MCP tools + HTTP endpoints)

```ts
import type { TavernaPlugin } from 'taverna/plugin'

const plugin: TavernaPlugin = {
  name: 'taverna-my-feature',
  features: [{
    name: 'my_tool',
    description: 'Does something useful',
    params: { id: z.string() },
    httpMethod: 'GET',
    httpPath: '/api/my-feature/:id',
    handler: async ({ id }, ctx) => ({ id, vault: ctx.vaultPath }),
  }],
}

export default plugin
```

### Scheduling plugin — override scoring

Plugins can replace the built-in project ranking, task triage, or permission resolution.
Each slot is independent — implement only the ones you need:

```ts
const plugin: TavernaPlugin = {
  name: 'taverna-my-scorer',
  scheduling: {
    scoring: {
      score(project, agentId, ctx) {
        // your scoring logic — return { project, agentId, score, factors }
        const score = project.priority === 'high' ? 100 : 50
        return { project, agentId, score, factors: [{ name: 'priority', points: score, detail: project.priority }] }
      },
      rank(projects, agentDefaults, ctx) {
        return projects
          .map(p => this.score(p, agentDefaults[p.tipo] ?? '', ctx))
          .sort((a, b) => b.score - a.score)
      },
    },
  },
}
```

Register via `TAVERNA_PLUGINS=/path/to/dist/index.js`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full interface reference.

## License

MIT
