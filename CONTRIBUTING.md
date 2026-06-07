# Contributing to taverna

## Setup

```bash
git clone https://github.com/digrao/taverna.git
cd taverna
npm install
npm run build
npm link          # makes `taverna` available globally, pointing at dist/
```

Verify:

```bash
npm run ci        # typecheck + lint + tests — must be green
```

Point it at a test vault — `taverna` locates its config first, and the
config is what tells it where the vault is (never the other way around):

```bash
mkdir -p ~/.config/taverna
cat > ~/.config/taverna/config.json <<'EOF'
{
  "vaultPath": "/path/to/a/scratch/vault",
  "projectsDir": "10_Projects",
  "flowDir": "20_Areas/2_Fluxos",
  "plugins": []
}
EOF

taverna get_projects   # should return an empty list against a fresh vault
```

See [INSTALL.md](INSTALL.md) for the full vault layout and how to author a
flow canvas — you'll want at least a minimal `task.canvas`/`project.canvas`
to exercise `move_task`/`move_project` while developing.

---

## Project layout

```
src/
  core/            CommandDef/CommandRegistry/TavernaContext — the contract
                   every command and protocol adapter is built on
    flow/          canvas-driven flow engine (states, transitions, field
                   resolution pipeline, template language)
    vault-commands.ts, task-commands.ts   core command groups
    index.ts       coreCommands — the populated registry every adapter reads from
  vault/           reads/writes the Obsidian vault: frontmatter, projects,
                   tasks, inbox, backlinks, scaffolding
  notifications/   TavernaEvent + NotificationBus — internal pub/sub
  plugin/          TavernaPlugin contract, namespace derivation, loader, scaffold
  http/            HTTP adapter (REST-ish JSON API, SSE, MCP-over-SSE bridge)
  mcp/             MCP adapter (tool generation from CommandDef)
  config.ts        single-file bootstrap (~/.config/taverna/config.json)
  cli.ts           CLI adapter — generates subcommands from the registry
```

Every module that's more than a single file has its own `SPEC.md` documenting
its contracts and invariants for evolution/maintenance — start there before
changing how something works. [`SPEC.md`](SPEC.md) at the repo root is the
index and the cross-cutting reference (naming convention, module map).

**The core stays thin and protocol-agnostic.** If you're writing something
that knows about HTTP/MCP/CLI specifics, it belongs in an adapter
(`http/`, `mcp/`, `cli.ts`); if it knows about a *specific* vault's
conventions (flow states, field names, integrations), it belongs in a
plugin, not in `core/` — see [`SPEC.md`](SPEC.md)'s "specs stay abstract" note.

---

## Adding a command

Write a `CommandDef`:

```ts
interface CommandDef {
  id: string
  description: string
  params?: JsonSchema          // plain JSON Schema — not Zod (see core/SPEC.md)
  expose?: ('http' | 'mcp' | 'cli')[]   // omitted → all protocols; [] → none
  handler: (params: Record<string, unknown>, ctx: TavernaContext) => Promise<unknown>
}
```

push it into `coreCommands` (in `core/index.ts`, alongside the existing
`vaultCommands`/`taskCommands`/`flowCommands` groups), and it is
**automatically live on every protocol it's exposed to** — `GET|POST /api/<id>`,
`taverna_<id>` over MCP, `taverna <id>` on the CLI. No adapter ever needs to
be touched. See [`core/SPEC.md`](src/core/SPEC.md) for the full contract.

---

## Writing a plugin

A plugin is any ES module whose **default export** is a `TavernaPlugin`.
Scaffold one with:

```bash
taverna create-plugin my-feature           # basic
taverna create-plugin my-feature --with-cli   # with a CLI entry point
```

### Minimal plugin

```ts
import type { TavernaPlugin, PluginCommand, PluginContext } from 'taverna/plugin'
import type { TavernaContext } from 'taverna/core'

const commands: PluginCommand[] = [
  {
    id: 'ping',
    description: 'Health check',
    params: { type: 'object', properties: {} },
    // expose omitted → published on http, mcp and cli:
    //   GET  /api/my-feature/ping
    //   MCP  taverna_my_feature_ping
    //   CLI  taverna my-feature ping
    handler: async (_params: Record<string, unknown>, _ctx: TavernaContext) => ({ ok: true }),
  },
]

const plugin: TavernaPlugin = {
  name: 'taverna-my-feature',
  commands,
  onLoad(_ctx: PluginContext) {
    // subscribe to notifications, warm caches, etc.
  },
}

export default plugin
```

`PluginCommand` is just `CommandDef` — a plugin command gets the exact same
validation, error handling, and protocol exposure as a core command, for
free. The plugin's **namespace** (derived from `name`: `"taverna-assets"` →
`"assets"`, or set explicitly via `namespace`) prefixes every generated
interface; the plugin itself never declares those forms.

### Raw HTTP routes (non-JSON content)

For dashboards, rendered assets, or anything that doesn't fit the
`{ data }`/`{ error }` JSON envelope:

```ts
const plugin: TavernaPlugin = {
  name: 'taverna-my-ui',
  httpRoutes: [{
    method: 'GET',
    path: '/my-ui',
    handler: async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h1>hello</h1>')
    },
  }],
}
```

### Registering the plugin

Add it to `plugins` in `~/.config/taverna/config.json`:

```json
{
  "vaultPath": "...",
  "projectsDir": "...",
  "flowDir": "...",
  "plugins": [
    { "path": "/absolute/path/to/taverna-my-feature/dist/index.js", "enabled": true }
  ]
}
```

The loader is fail-safe: a plugin that fails to import or throws during
`onLoad` is logged to stderr and skipped — it never crashes the core or
prevents other plugins from loading. See
[`plugin/SPEC.md`](src/plugin/SPEC.md) for the full contract.

---

## Writing flow canvases

The canvas-driven flow engine has no hardcoded states — `task.canvas`,
`project.canvas` (or any other flow you name) live entirely in the vault as
configuration. If you're changing flow-engine code, you'll need a test flow
to exercise it: see `tasks/0-guia-canvas.md` for the canonical walkthrough of
how a `.canvas` + `nodes/<id>.md` pair becomes a state machine, and
[`core/flow/SPEC.md`](src/core/flow/SPEC.md) for the engine's contract
(resolution pipeline, template language, transitions).

---

## CI requirements

Every commit must pass:

```bash
npm run ci   # typecheck + lint + tests
```

- No `--no-verify` bypasses
- One logical change per commit
- Commit message format: `<type>(<scope>): <summary>`
  — types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `ci`, `spec`
