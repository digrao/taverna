# http — spec

The HTTP adapter. A thin translation layer from the command registry to a
JSON API plus two streaming bridges (SSE for notifications, SSE for MCP) —
no business logic lives here, only route generation and request/response
shaping. See [`core/SPEC.md`](../core/SPEC.md) for `CommandDef`/`CommandRegistry`,
and the root [`SPEC.md`](../../SPEC.md) for the cross-protocol naming
convention this adapter implements its half of.

## Files

| File | Responsibility |
|---|---|
| `server/routes.ts` | `Router` — request dispatch, route generation, SSE, MCP-over-SSE bridging |
| `server/index.ts` | `createServer(ctx, opts)` — wires plugins + registry into a `Router` and a `node:http` server |

## Route generation

Every command exposed to `'http'` (`expose` omitted or including `'http'`)
becomes:

| Origin | Path |
|---|---|
| core (no namespace) | `/api/<id>` |
| plugin (namespaced) | `/api/<namespace>/<id>` |

The HTTP **method** is derived from the `id` itself — `httpMethodFor`:
`get_*` → `GET`, everything else → `POST`. This keeps `CommandDef` free of a
protocol-specific `method` field; the convention lives in the adapter, where
it's cheap to change for *all* commands at once if it ever needs to.

`GET /api/config/schema` publishes every HTTP-exposed command's
`{ id, namespace, path, method, description, params }` — this is what lets a
generic client (or a UI) discover the full API shape without hardcoding it.

## Request handling and the response envelope

`callCommand` builds `params` from the query string (`GET`) or a parsed JSON
body (`POST`, best-effort — malformed JSON becomes `{}`), then calls
`registry.execute(namespace, id, params, ctx)`. The result is normalized into
exactly one of two envelopes:

```
200  { data: <result> }
400  { error: <message>, code: 'COMMAND_ERROR' }
404  { error: <message>, code: 'NOT_FOUND' }
```

Every response — success or failure, core or plugin command — has this same
shape. A client never needs to special-case which command it called; it only
needs to check for `error`.

## `/events` — notification-bus SSE

A long-lived `text/event-stream` connection. On connect, the router sends a
`connected` event and registers the response in `sseClients`; the router's
constructor subscribes to `'*'` on the `NotificationBus` once and `broadcast`s
every event to all connected clients as `event: <type>\ndata: <json>`. A
client write failure silently drops that client (`sseClients.delete`) rather
than tearing down the stream for everyone else — consistent with the bus's
own best-effort delivery philosophy (see [`notifications/SPEC.md`](../notifications/SPEC.md)).

## `/mcp/sse` + `/mcp/message` — MCP over HTTP

A bridge for MCP clients that would rather speak HTTP/SSE than spawn a
process. `handleMcpSSE` creates a fresh `createMcpServer(ctx)` (the same
factory `taverna mcp` uses over stdio — see [`mcp/SPEC.md`](../mcp/SPEC.md))
connected through an `SSEServerTransport`, keyed by `transport.sessionId` in
`mcpTransports`; `handleMcpMessage` looks the session up by the `sessionId`
query parameter and forwards the POST body to `transport.handlePostMessage`.
Sessions clean themselves up via `transport.onclose`. This is purely
transport plumbing — the MCP server instance is identical regardless of
whether it's reached via stdio or this bridge.

## Plugin `HttpRoute`s

Checked last, after `/api/...` command dispatch fails to match. Matched by
exact path or prefix (`path` ending in `*`) plus method, then handed the raw
`req`/`res` — see [`plugin/SPEC.md`](../plugin/SPEC.md) for when a plugin
should reach for this instead of a command.

## Evolution notes

- **New cross-cutting endpoints belong in the adapter convention, not as
  special cases.** If you need a new generic capability (e.g. a different
  streaming format), prefer extending the convention so it applies to every
  command uniformly, the way `/api/config/schema` and `/events` do.
- **Don't grow `Router` with business logic.** A handler here should only
  ever: parse the transport-specific request shape, call `registry.execute`
  or forward to a plugin route, and shape the transport-specific response.
  Anything more belongs in a command handler.
- If a new streaming/bridging need arises, look at how `/mcp/sse` reuses
  `createMcpServer` — the pattern of "one shared factory, multiple thin
  transport bridges" is the one to repeat.
