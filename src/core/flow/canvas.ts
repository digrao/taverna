import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter, getString, getStringArray } from '../../vault/frontmatter.js'
import type { Flow, FlowState, FlowTransition } from './types.js'

interface CanvasNode {
  id: string
  type: string
  file?: string
}

interface CanvasEdge {
  fromNode: string
  toNode: string
}

interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

async function readNodeSchema(path: string): Promise<FlowState> {
  const raw = await readFile(path, 'utf8')
  const { data } = parseFrontmatter(raw)
  const id = getString(data, 'status')
  if (!id) throw new Error(`Node schema ${path} is missing required field "status"`)

  return {
    id,
    required: getStringArray(data, 'required'),
    default: (data['default'] as Record<string, string> | undefined) ?? {},
    infer: (data['infer'] as Record<string, string> | undefined) ?? {},
  }
}

/**
 * Reads a `.canvas` flow definition from `flowDir`. Nodes/edges are JSON; a node
 * represents a state only when a matching `nodes/<id>.md` schema file exists —
 * the canvas may also contain plain labels and support notes (see `0-guia-canvas.md`).
 * The canvas-internal node id is plumbing only: the identifier exposed to the rest
 * of the system is the `status` value declared in the schema file.
 */
export async function readFlow(flowDir: string, flow: string): Promise<Flow> {
  const canvasPath = join(flowDir, `${flow}.canvas`)
  const raw = await readFile(canvasPath, 'utf8')
  const canvas = JSON.parse(raw) as CanvasData

  const byCanvasId = new Map<string, FlowState>()
  for (const node of canvas.nodes) {
    const schemaPath = join(flowDir, 'nodes', `${node.id}.md`)
    if (!existsSync(schemaPath)) continue
    byCanvasId.set(node.id, await readNodeSchema(schemaPath))
  }

  const states = [...byCanvasId.values()]
  const transitions: FlowTransition[] = []
  for (const edge of canvas.edges) {
    const from = byCanvasId.get(edge.fromNode)
    const to = byCanvasId.get(edge.toNode)
    if (from && to) transitions.push({ from: from.id, to: to.id })
  }

  return { states, transitions }
}
