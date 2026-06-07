/** A state's pipeline schema, declared once in nodes/<canvasNodeId>.md (matched by `status`). */
export interface FlowState {
  /** State identifier — the `status` value frontmatter items carry, e.g. "🧩" */
  id: string
  /** Fields that must be resolved before transitioning into this state */
  required: string[]
  /** Template strings evaluated when a required field is still empty (see template.ts) */
  default: Record<string, string>
  /** Scope chains for fields resolvable without prompting, e.g. "project > task" */
  infer: Record<string, string>
}

export interface FlowTransition {
  from: string
  to: string
}

export interface Flow {
  states: FlowState[]
  transitions: FlowTransition[]
}
