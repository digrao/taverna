# plugin — spec

The contract that lets taverna stay a thin core. Anything specific to a
particular workflow, integration, or vault convention — agent execution,
chat bridges, dashboards, university/work-specific commands — is a plugin,
not core code. This module defines *what a plugin looks like* and *how it's
discovered and wired in*; it owns no business logic of its own.

## Files

| File | Responsibility |
|---|---|
| `types.ts` | `TavernaPlugin`, `PluginCommand`, `HttpRoute`, `PluginContext` |
| `loader.ts` | `deriveNamespace`, `loadPlugins` — discovery, registration, fail-safety |
| `scaffold.ts` | Generates a starter plugin package from a template |

## `TavernaPlugin`

```ts
interface TavernaPlugin {
  name: string                      // convention: "taverna-<namespace>"
  namespace?: string                // overrides the derived namespace
  commands?: PluginCommand[]        // PluginCommand = CommandDef
  httpRoutes?: HttpRoute[]
  onLoad?: (ctx: PluginContext) => void
}
```

A plugin is a module whose **default export** is a `TavernaPlugin`. Its
surface is intentionally tiny: commands (which automatically become CLI
subcommands, HTTP routes, and MCP tools — see the root
[`SPEC.md`](../../SPEC.md) naming convention), raw HTTP routes for content
that doesn't fit the JSON command model (dashboards, assets, slides), and an
`onLoad` hook for one-time setup (subscribing to the notification bus,
opening connections, etc.).

`PluginCommand` is a **type alias** for `CommandDef` — a plugin command is
not a different thing from a core command, just one registered under a
namespace. This is what guarantees plugins get the exact same validation,
error handling, and protocol exposure as core commands, for free.

## Namespace derivation

```ts
deriveNamespace(plugin) // "taverna-assets" → "assets"; explicit `namespace` always wins
```

The namespace prefixes every generated interface
(`/api/<namespace>/<id>`, `taverna_<namespace>_<id>`, `taverna <namespace> <id>`)
— a plugin never declares these forms itself, only its `name`/`namespace`.
This is the mechanism that lets two plugins (or a plugin and core) define a
command with the same `id` without collision: `namespace + id` is the
registry's identity key (see [`core/SPEC.md`](../core/SPEC.md)).

## `loadPlugins(config, notificationBus)`

Reads `config.plugins` (each entry `{ path, enabled }`), and for every
enabled entry: dynamically `import()`s it, validates the default export has a
`name`, derives its namespace, registers each of its `commands` into
`coreCommands` under that namespace, collects its `httpRoutes`, and calls
`onLoad({ config, notificationBus })`.

**Fail-safe by design**: a plugin that fails to import, lacks a valid default
export, or throws during `onLoad` is logged to stderr and skipped — it never
crashes the core or prevents other plugins from loading. This is what lets
users freely experiment with plugins (including ones they're actively
developing) without risking the whole runtime.

`PluginContext` is the plugin-facing equivalent of `TavernaContext` — deliberately
narrower (no `prompt`, since plugin setup code runs outside any command
invocation).

## `HttpRoute`

An escape hatch for content that doesn't fit the `{ data }`/`{ error }` JSON
command envelope — dashboards, rendered assets, static files. Unlike commands,
routes declare their own `path` and `method` directly and receive the raw
Node `req`/`res`; there's no namespace prefix, no schema validation, no
generation across protocols. Reach for a command first; reach for an
`HttpRoute` only when the response genuinely isn't JSON.

## Evolution notes

- **The plugin surface should stay this small.** Every new capability a
  plugin needs should be expressible as a command, an `HttpRoute`, an
  `onLoad` side effect, or a notification-bus subscription — not a new
  hook on `TavernaPlugin`. A growing plugin interface is a sign business
  logic is creeping into the core that should stay in the plugin instead.
- `PluginContext` should only grow if *every* plugin needs the new
  capability at load time — anything command-specific belongs on
  `TavernaContext` instead (see [`core/SPEC.md`](../core/SPEC.md)).
- Keep the loader fail-safe. Any change here should preserve "one bad plugin
  never takes down the core or its siblings."
