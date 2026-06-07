# core/flow — spec

The canvas-driven flow engine. It turns user-authored Obsidian Canvas files
into state machines that drive `status` transitions for projects and tasks —
and resolves the fields each state requires before allowing a transition.

This is the most novel part of the core: it has no precedent in the legacy
codebase and encodes a genuinely abstract mechanism — the *shape* of a flow,
never a specific one. A specific flow (its states, required fields, inference
chains) is **vault configuration**, authored by the user as `.canvas` +
`nodes/<id>.md` files. See `tasks/0-guia-canvas.md` for the canonical
walkthrough of how to read a `.canvas`, and `wiki/Template-Language.md` for the
template syntax.

## Files

| File | Responsibility |
|---|---|
| `types.ts` | `FlowState`, `FlowTransition`, `Flow` |
| `canvas.ts` | `readFlow` — parses a `.canvas` + its node schemas into a `Flow` |
| `template.ts` | `resolveTemplate` — the template language (`%n`, strftime subset, `{{field\|fallback}}`) |
| `resolve.ts` | `resolveRequiredFields` — the `infer → default → prompt` resolution pipeline |
| `index.ts` | `getFlow`, `getFlowState`, `moveTask`, `moveProject` + `flowCommands` (the "movement" command group) |

## Reading a flow: `readFlow(flowDir, flowName)`

A flow is `<flowDir>/<flowName>.canvas` (Obsidian Canvas JSON: `nodes` +
`edges`). The **key rule**, verified empirically against real flow data: a
canvas node represents a state *if and only if* a matching
`<flowDir>/nodes/<canvasNodeId>.md` schema file exists. Canvases routinely
contain plain-text labels and support notes that aren't states — their absence
of a schema file is what excludes them, not their `type` field.

The schema file's frontmatter is the state's contract:

```yaml
---
status: <state identifier>   # e.g. an emoji — whatever the user's flow uses
required: [field, ...]
default: { field: "template string" }
infer:   { field: "scope > scope > ..." }
---
```

`status` is the **real** identifier — the canvas-internal node id (a hex
string) is pure plumbing used only to resolve edges into transitions. Once
`readFlow` returns, nothing downstream ever sees the canvas id again; `Flow`
only carries `status` values. This is what lets `get_flow_state`/`move_*`
operate purely in terms of the `status` already present in frontmatter.

## The resolution pipeline: `resolveRequiredFields`

When transitioning into a state, every field in its `required` list must end
up with a value before anything is written. For each field, in order:

1. **Already set** — if the item's frontmatter already has a non-empty value,
   keep it.
2. **`infer`** — a scope chain like `"project > task"`: look the field up in
   each named scope's frontmatter, left to right, first non-empty wins. Scopes
   are passed in by the caller (`moveTask` provides `project`/`task`;
   `moveProject` provides only `project`). Unknown scope names simply don't
   resolve — the engine has no opinion on what scopes *should* exist; that's
   entirely up to the user's `infer` chains and what the caller supplies.
3. **`default`** — a template string (see below), evaluated against the
   current frontmatter, the `now` timestamp, and a `%n` counter (count of
   existing `.md` items in the relevant directory — `countExistingItems`).
4. **prompt** — `ctx.prompt(field)`, if the context provides one. If not,
   the field is recorded as missing and resolution continues (to surface *all*
   missing fields at once, not just the first).

If anything ends up missing, the whole transition fails atomically — **nothing
is written**. This is deliberate: a partially-resolved transition would leave
the item in an inconsistent state (new `status` without its required fields,
or vice versa).

## The template language: `resolveTemplate`

Implements the subset documented in `wiki/Template-Language.md`:
- `{{field}}` / `{{field\|fallback}}` — Handlebars-style frontmatter
  interpolation; empty/missing resolves to the fallback (or empty string).
- `%n` — sequential counter (`ctx.counter`, supplied by the caller).
- `%Y %m %d %H %M %S` — a strftime subset over `ctx.now`.
- `%%` escapes a literal `%`; unknown `%x` sequences pass through unchanged.

This file is the one place the syntax is implemented — if the template
language grows, this is where it grows, and the wiki page is the spec for it.

## Transitions: `moveTask` / `moveProject`

Both funnel through the internal `transition()` orchestrator:

1. Look up the destination state; reject unknown states.
2. Validate the edge: the current `status` (if any) must have an outgoing
   transition to the destination in the flow's `transitions`. This is what
   makes `move_*` a *state machine* rather than a free-form field setter.
3. Resolve required fields via the pipeline above (failing atomically on any
   missing field).
4. Write the new `status` plus every resolved field to frontmatter via
   `gray-matter`, and publish `core.task.moved` / `core.project.moved` on the
   notification bus.

`getFlowState` is the read-only counterpart: given an item's current `status`,
it returns the states reachable from it (`next`) and the states that can reach
it (`previous`) — useful for clients building "what can I do from here?" UIs
without re-implementing edge traversal.

## Evolution notes

- **Never hardcode a flow.** If you catch yourself writing a specific state
  identifier, field name, or scope name into this module, stop — it belongs in
  a `.canvas`/`nodes/*.md` pair in the vault, not in code (see the root spec's
  "specs stay abstract" note, and `[[feedback-taverna-spec]]`).
- The engine is intentionally silent about *which* scopes exist for `infer` —
  adding a new built-in scope means deciding what frontmatter the caller should
  pass for it, which is a `moveTask`/`moveProject`-level decision, not a
  `resolveRequiredFields`-level one.
- `countExistingItems` backs `%n`; it's exported from `flow/index.ts` because
  both the flow engine (`moveTask`/`moveProject`) and `add_task` (in
  `task-commands.ts`, for inferring a new task's title from the entry state's
  `default.title`) need the same counting semantics. Keep it that way rather
  than duplicating the directory-scan logic.
