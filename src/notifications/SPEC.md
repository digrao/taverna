# notifications — spec

The internal pub/sub backbone. Core commands and plugins publish typed
events; adapters and plugins subscribe to glob patterns and deliver on
whatever transport they own (SSE, a chat bridge, a log, …). This module knows
nothing about *what* an event means or *how* it's delivered — only how to
route it from publishers to subscribers.

## Files

| File | Responsibility |
|---|---|
| `types.ts` | `TavernaEvent`, `EventHandler` |
| `bus.ts` | `NotificationBus` — `publish`/`subscribe` with glob-pattern matching |

## `TavernaEvent`

```ts
interface TavernaEvent {
  type: string        // namespaced: "core.task.moved", "<plugin-namespace>.<entity>.<action>"
  payload: unknown
  timestamp: string
}
```

`type` is the routing key and the only structurally meaningful field — `payload`
is intentionally `unknown`. The bus never inspects, validates, or transforms
it; that would couple it to specific event shapes. Publishers and subscribers
agree on `payload` shape out of band (by convention, documented alongside
whatever publishes that `type`).

### The namespacing convention

`type` strings follow `<origin>.<entity>.<action>` — `core.*` for events the
core publishes (e.g. `core.task.moved`, `core.project.moved`), and
`<plugin-namespace>.*` for plugin-published events. This is what makes glob
subscriptions useful (`"core.*"`, `"core.task.*"`, `"*"`) without the bus
having to know what any of the segments mean. New event types should follow
the same shape so they compose with existing subscriptions.

## `NotificationBus`

```ts
class NotificationBus {
  publish(event: TavernaEvent): void
  subscribe(pattern: string, handler: EventHandler): () => void  // returns an unsubscribe fn
}
```

- **Glob matching** (`matchesPattern`): `*` matches any run of characters;
  everything else is matched literally (regex-escaped). `"core.*"` matches
  `"core.task.moved"`; `"*"` matches everything. There is no `**`-vs-`*`
  distinction or brace-expansion — the pattern language is deliberately the
  smallest thing that lets subscribers select by namespace/entity/action
  without needing a real glob library.
- **Best-effort, fire-and-forget delivery**: `publish` fans out to every
  matching handler via `Promise.allSettled` and does not await or surface the
  result. A throwing/rejecting subscriber never affects other subscribers or
  the publisher — this is what lets the bus sit on the hot path of every
  mutating command without becoming a reliability or latency liability.
- **Synchronous fan-out, async delivery**: matching subscriptions are
  resolved synchronously at `publish`-time (so a concurrent `subscribe`/
  unsubscribe during delivery can't change who receives *this* event), but
  each handler runs asynchronously and independently.

## Evolution notes

- Keep `payload` opaque. If you're tempted to give the bus knowledge of
  specific payload shapes (to validate, route, or transform on them), that
  belongs in the publisher/subscriber pair, not here — the bus's value is
  precisely that it doesn't need to know.
- If delivery guarantees beyond best-effort become necessary (retries,
  ordering, persistence), that's a different component — likely a plugin
  wrapping or replacing the bus — not a change to this one. Keeping
  `NotificationBus` minimal is what makes it safe to call synchronously from
  every mutating command.
- New built-in `core.*` event types should be published from the same place
  the corresponding mutation happens (see `core/flow/SPEC.md`'s
  `core.task.moved`/`core.project.moved` for the pattern), and named
  consistently with the `<entity>.<action>` convention.
