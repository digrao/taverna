# mcp — spec

The MCP (Model Context Protocol) adapter. Exposes every command published on
the `'mcp'` protocol as an MCP tool — another thin translation layer over the
command registry, structurally the sibling of [`http/SPEC.md`](../http/SPEC.md)
and `cli.ts`. See [`core/SPEC.md`](../core/SPEC.md) for `CommandDef`/
`CommandRegistry`, and the root [`SPEC.md`](../../SPEC.md) for the
cross-protocol naming convention.

## Files

| File | Responsibility |
|---|---|
| `server.ts` | `createMcpServer(ctx)` — builds the MCP `Server`, generates tools from the registry |

## `createMcpServer(ctx): Server`

A single factory, shared by every transport this adapter supports — it is
*the* MCP server; transports only differ in how they connect to it (see
below). Building it:

1. Takes every command from `coreCommands.listFor('mcp')` (i.e. `expose`
   omitted or including `'mcp'`).
2. Names each tool via `toolName`: `taverna_<id>` for core commands,
   `taverna_<namespace>_<id>` for plugin commands — the MCP half of the same
   convention `http`/`cli` implement (see the root spec's naming table).
3. Registers a `ListToolsRequestSchema` handler that reports
   `{ name, description, inputSchema }` for each tool, where `inputSchema` is
   `cmd.params` **passed through as raw JSON Schema** (defaulting to an empty
   object schema if the command takes no params).
4. Registers a `CallToolRequestSchema` handler that looks the tool up by name
   and funnels the call through `coreCommands.execute(namespace, id, arguments, ctx)`
   — the exact same execution path HTTP and CLI use, so validation and error
   shape are identical across all three.

### Why the low-level `Server`, not `McpServer`

The high-level `McpServer.tool()`/`registerTool()` API requires
Zod-compatible schemas (`ZodRawShapeCompat | AnySchema`); it cannot accept
raw JSON Schema. Since `CommandDef.params` is deliberately plain JSON Schema
(see [`core/SPEC.md`](../core/SPEC.md) — "Why JSON Schema, not Zod"), this
adapter uses the low-level `Server` + `setRequestHandler` directly and casts
`cmd.params` to `Tool['inputSchema']`. This is the one place that cast lives;
it exists *because* the SDK's ergonomic layer assumes Zod and the core
contract deliberately doesn't.

### Result shaping

`ok`/`err` wrap `registry.execute`'s `{ data }` / `{ error }` outcome into
MCP's `content: [{ type: 'text', text }]` shape, setting `isError: true` on
failure. This mirrors the HTTP adapter's `{ data }` / `{ error, code }`
envelope at the semantic level — same two outcomes, shaped for MCP's
content-block convention instead of a JSON body.

## Transports

`createMcpServer` returns a bare `Server` — connecting it to a transport is
the caller's job, and there are two:

- **stdio** (`taverna mcp`, in `cli.ts`): `createMcpServer(ctx).connect(new StdioServerTransport())`
  — the standard way an MCP client spawns and talks to a local server.
- **HTTP/SSE** (`/mcp/sse` + `/mcp/message`, in [`http/SPEC.md`](../http/SPEC.md)):
  the `Router` builds a fresh server per session via the same factory and
  connects it through an `SSEServerTransport`, for clients that prefer not to
  spawn a process.

Both expose *identical* tools — there is exactly one MCP server
implementation; only the transport differs. If a third transport is ever
needed, it should be a thin `connect()` call against this same factory, never
a parallel implementation.

## Evolution notes

- **One factory, many transports** — preserve this. Anything that would
  require two different `createMcpServer`-shaped functions is a sign the
  difference belongs in the transport layer, not here.
- If the MCP SDK's high-level API ever supports raw JSON Schema, revisit
  whether the low-level `Server` is still necessary — but don't switch back
  to Zod-based registration; that would force `CommandDef.params` to change
  shape for one adapter's convenience.
- Keep `toolName` consistent with `httpMethodFor`/`commandPath` (HTTP) and
  the CLI's subcommand generation — all three derive their public surface
  from the same `id`/`namespace` pair, and drift between them would break the
  "identical across protocols" guarantee the root spec promises.
