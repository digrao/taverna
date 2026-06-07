# taverna — spec index

This is the as-built architecture reference, kept for evolution and maintenance.
It documents the contracts the code actually implements — not the aspirational
design. The original design specs that drove this rewrite live as vault tasks
(`tasks/1-spec-core-commands.md` … `tasks/6-spec-changelog-wiki.md`, all `🏖️`
now); they remain useful as historical context for *why* a contract looks the
way it does, but when in doubt, the module `SPEC.md` files and the code win.

## What taverna is

A headless, protocol-agnostic orchestrator over an Obsidian vault. It reads
projects/tasks/inbox from frontmatter and folder structure, drives state
machines from user-authored Obsidian Canvas files (`.canvas` + node schemas),
and exposes everything — core and plugin commands alike — identically over
CLI, HTTP, and MCP. **No business logic lives in the protocol adapters**; they
only translate a `CommandDef` into the shape each transport expects.

Agent execution, scheduling, and monitoring are explicitly **not** part of the
core — they belong to separate plugins (e.g. `taverna-claude-code`). Flows
(canvases + node schemas) are user configuration, not code: taverna ships the
*mechanism* to read them, never a hardcoded flow.

## Module map

| Module | Spec | Responsibility |
|---|---|---|
| `core/` | [`core/SPEC.md`](src/core/SPEC.md) | `CommandDef`/`CommandRegistry`/`TavernaContext` — the contract every command and protocol adapter is built on |
| `core/flow/` | [`core/flow/SPEC.md`](src/core/flow/SPEC.md) | Canvas-driven flow engine: states, transitions, field-resolution pipeline, template language |
| `vault/` | [`vault/SPEC.md`](src/vault/SPEC.md) | Reads/writes the Obsidian vault: projects, tasks, inbox, backlinks, scaffolding |
| `notifications/` | [`notifications/SPEC.md`](src/notifications/SPEC.md) | `TavernaEvent` + `NotificationBus` — internal pub/sub with glob-pattern subscriptions |
| `plugin/` | [`plugin/SPEC.md`](src/plugin/SPEC.md) | `TavernaPlugin` contract, namespace derivation, plugin discovery/loading |
| `http/` | [`http/SPEC.md`](src/http/SPEC.md) | HTTP adapter: REST-ish JSON API, SSE event stream, MCP-over-SSE bridge |
| `mcp/` | [`mcp/SPEC.md`](src/mcp/SPEC.md) | MCP adapter: tool generation from `CommandDef`, shared by stdio and HTTP transports |
| `config.ts` | — | Single-file bootstrap (`~/.config/taverna/config.json`); locates the vault, never the other way around |
| `cli.ts` | — | CLI adapter: generates subcommands from the registry (see naming convention below); has no `SPEC.md` of its own since it's a single file, not a module |

## Cross-cutting: the naming convention

Every command — core or plugin — is published identically across all three
protocols, derived purely from its `id` and (for plugins) its `namespace`:

| Origin | HTTP | MCP | CLI |
|---|---|---|---|
| core | `GET\|POST /api/<id>` | `taverna_<id>` | `taverna <id>` |
| plugin | `GET\|POST /api/<namespace>/<id>` | `taverna_<namespace>_<id>` | `taverna <namespace> <id>` |

The HTTP method is derived from the `id` itself: commands named `get_*` are
`GET` (read), everything else is `POST` (write). This keeps `CommandDef` free
of protocol-specific fields — the convention lives in the adapter, where it
belongs.

A plugin's namespace is derived from its `name` (`"taverna-assets"` →
`"assets"`) unless overridden explicitly. See [`plugin/SPEC.md`](src/plugin/SPEC.md).

## Evolution notes

- **Specs stay abstract.** Never encode a user's specific flow states, field
  names, or inference chains into core code or these specs — that's vault
  configuration (canvas + node schema files), and taverna must stay
  distributable across different vaults/flows.
- **Adapters stay thin.** If you find yourself adding business logic to
  `cli.ts`, `http/`, or `mcp/`, it belongs in a core command or a plugin
  instead — the adapters' only job is translating `CommandDef` into a
  transport-specific shape.
- **The registry is the single source of truth** for what's exposed where.
  `expose` on a `CommandDef` (omitted = all protocols, `[]` = none) is the only
  per-command protocol knob; everything else is convention-driven.
