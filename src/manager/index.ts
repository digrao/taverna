/** Public API for the Process Manager.
 *
 * Layers (import from submodule for internals, from here for external consumers):
 *   observability/ — event bus, health, budget, active sessions
 *   scheduling/    — policies, scoring, triage, session planning, plugin interfaces
 *   prompt/        — prompt building, snapshot store, session log
 *   engine/        — executor, drain, scheduler
 */
export * from './observability/index.js'
export * from './scheduling/index.js'
export * from './prompt/index.js'
export * from './engine/index.js'
