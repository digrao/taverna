import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFlow } from '../../../src/core/flow/canvas.js'

let flowDir: string

beforeEach(() => {
  flowDir = join(tmpdir(), `taverna-flow-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(flowDir, 'nodes'), { recursive: true })
})

afterEach(() => {
  rmSync(flowDir, { recursive: true, force: true })
})

function writeNode(canvasId: string, frontmatter: string): void {
  writeFileSync(join(flowDir, 'nodes', `${canvasId}.md`), `---\n${frontmatter}\n---\n`, 'utf8')
}

function writeCanvas(name: string, nodes: { id: string; type?: string }[], edges: [string, string][]): void {
  const canvas = {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type ?? 'file', file: `nodes/${n.id}.md` })),
    edges: edges.map(([fromNode, toNode], i) => ({ id: `e${i}`, fromNode, toNode })),
  }
  writeFileSync(join(flowDir, `${name}.canvas`), JSON.stringify(canvas), 'utf8')
}

describe('readFlow', () => {
  it('only treats canvas nodes with a matching nodes/<id>.md schema as states', async () => {
    writeNode('a', 'status: 🧩')
    writeNode('b', 'status: 🏖️')
    // 'label' has a canvas node but no schema file — must be excluded
    writeCanvas('task', [{ id: 'a' }, { id: 'b' }, { id: 'label', type: 'text' }], [['a', 'b']])

    const flow = await readFlow(flowDir, 'task')

    expect(flow.states.map((s) => s.id).sort()).toEqual(['🏖️', '🧩'])
  })

  it('exposes the schema-declared status as the state identifier, not the canvas node id', async () => {
    writeNode('canvas-node-a', 'status: 🧩')
    writeNode('canvas-node-b', 'status: 🏖️')
    writeCanvas('task', [{ id: 'canvas-node-a' }, { id: 'canvas-node-b' }], [['canvas-node-a', 'canvas-node-b']])

    const flow = await readFlow(flowDir, 'task')

    expect(flow.states.every((s) => !s.id.includes('canvas-node'))).toBe(true)
    expect(flow.transitions).toEqual([{ from: '🧩', to: '🏖️' }])
  })

  it('parses required/default/infer from the node schema frontmatter', async () => {
    writeNode(
      'a',
      ['status: 🧩', 'required:', '  - project', 'default:', '  title: "%n-{{summary}}"'].join('\n'),
    )
    writeCanvas('task', [{ id: 'a' }], [])

    const [state] = (await readFlow(flowDir, 'task')).states
    expect(state).toEqual({
      id: '🧩',
      required: ['project'],
      default: { title: '%n-{{summary}}' },
      infer: {},
    })
  })

  it('drops edges that reference a node without a schema (not a real transition)', async () => {
    writeNode('a', 'status: 🧩')
    writeCanvas('task', [{ id: 'a' }, { id: 'label', type: 'text' }], [['a', 'label'], ['label', 'a']])

    const flow = await readFlow(flowDir, 'task')
    expect(flow.transitions).toEqual([])
  })

  it('throws when a node schema file lacks the required "status" field', async () => {
    writeNode('a', 'required:\n  - project')
    writeCanvas('task', [{ id: 'a' }], [])

    await expect(readFlow(flowDir, 'task')).rejects.toThrow(/missing required field "status"/)
  })
})
