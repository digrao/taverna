# taverna

A headless orchestrator that reads projects from an Obsidian vault, builds context-aware prompts, and runs [Claude Code](https://claude.ai/code) sessions on them.

The core metaphor is a **deadpool board**: projects are contracts, agents are specialists, and the scheduler assigns work to whoever is eligible. A `@dev-agent` works on software, a `@study-assistant` processes course material. Everything runs in the background via systemd, observable through an HTTP dashboard.

## Quick start

```bash
npm install -g taverna
export VAULT_PATH=~/my-vault

taverna work --dry-run    # preview what would run
taverna work              # run once and exit
taverna serve             # open dashboard at http://localhost:2948/dashboard
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

Plugins extend taverna with new MCP tools, HTTP routes, and CLI commands without touching the core:

```ts
import type { TavernaPlugin } from 'taverna/plugin'
import { z } from 'zod'

const plugin: TavernaPlugin = {
  name: 'my-feature',
  features: [{
    name: 'my_tool',
    description: 'Does something',
    params: { id: z.string() },
    httpMethod: 'GET',
    handler: async ({ id }, ctx) => ({ id, vault: ctx.vaultPath }),
  }],
}

export default plugin
```

Register via `TAVERNA_PLUGINS=/path/to/dist/index.js`. See the [Plugin System wiki page](https://github.com/digrao/taverna/wiki/Plugin-System) for the full interface.

## License

MIT
