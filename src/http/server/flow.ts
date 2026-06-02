import type { VaultProject } from '../../vault/types.js'

// ---------------------------------------------------------------------------
// State machine definition (mirrors TaskState in vault/types.ts)
// ---------------------------------------------------------------------------

const STATE_ORDER = [
  'backlog',
  'tarefinha',
  'tarefa',
  'em-progresso',
  'aguardando_humano',
  'bloqueada',
  'concluida',
] as const

const STATE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  tarefinha: 'Tarefinha',
  tarefa: 'Tarefa',
  'em-progresso': 'Em Progresso',
  aguardando_humano: 'Aguardando Humano',
  bloqueada: 'Bloqueada',
  concluida: 'Concluída',
}

// SVG layout -----------------------------------------------------------------

interface Node {
  id: string
  x: number
  y: number
  w: number
  h: number
}
// x,y = top-left corner

const W = 110,
  H = 40,
  _GAP = 20

// Row 1 — happy path (y=20)
const ROW1_Y = 20
const nodes: Node[] = [
  { id: 'backlog', x: 0, y: ROW1_Y, w: W, h: H },
  { id: 'tarefinha', x: 150, y: ROW1_Y, w: W, h: H },
  { id: 'tarefa', x: 300, y: ROW1_Y, w: W, h: H },
  { id: 'em-progresso', x: 450, y: ROW1_Y, w: W + 8, h: H },
  { id: 'concluida', x: 618, y: ROW1_Y, w: W, h: H },
  // Row 2 — off-path (y=100)
  { id: 'aguardando_humano', x: 450, y: 110, w: W + 8, h: H },
  { id: 'bloqueada', x: 450, y: 190, w: W, h: H },
]

function cx(n: Node) {
  return n.x + n.w / 2
}
function cy(n: Node) {
  return n.y + n.h / 2
}
function nodeById(id: string) {
  return nodes.find((n) => n.id === id)!
}

interface Edge {
  from: string
  to: string
  dashed?: boolean
  label?: string
}
const edges: Edge[] = [
  { from: 'backlog', to: 'tarefinha' },
  { from: 'tarefinha', to: 'tarefa' },
  { from: 'tarefa', to: 'em-progresso' },
  { from: 'em-progresso', to: 'concluida' },
  { from: 'em-progresso', to: 'aguardando_humano' },
  { from: 'aguardando_humano', to: 'bloqueada' },
  { from: 'aguardando_humano', to: 'em-progresso', dashed: true, label: 'resolvido' },
  { from: 'bloqueada', to: 'em-progresso', dashed: true, label: 'desbloqueado' },
]

function edgePath(e: Edge): string {
  const f = nodeById(e.from),
    t = nodeById(e.to)
  // right (same row)
  if (t.y === f.y && t.x > f.x) return `M ${f.x + f.w} ${cy(f)} L ${t.x - 2} ${cy(t)}`
  // down (same column)
  if (Math.abs(cx(f) - cx(t)) < 4 && t.y > f.y)
    return `M ${cx(f)} ${f.y + f.h} L ${cx(t)} ${t.y - 2}`
  // back-up curves (go left then up)
  if (e.from === 'aguardando_humano' && e.to === 'em-progresso') {
    const lx = f.x - 44
    return `M ${f.x} ${cy(f)} C ${lx} ${cy(f)}, ${lx} ${cy(t)}, ${t.x} ${cy(t)}`
  }
  if (e.from === 'bloqueada' && e.to === 'em-progresso') {
    const lx = f.x - 62
    return `M ${f.x} ${cy(f)} C ${lx} ${cy(f)}, ${lx} ${cy(t)}, ${t.x} ${cy(t)}`
  }
  return `M ${f.x + f.w} ${cy(f)} L ${t.x} ${cy(t)}`
}

// Edge label midpoint
function edgeMid(e: Edge): { x: number; y: number } | null {
  if (!e.label) return null
  const f = nodeById(e.from)
  if (e.from === 'aguardando_humano') return { x: f.x - 44, y: cy(f) - 6 }
  if (e.from === 'bloqueada') return { x: f.x - 62, y: cy(f) - 6 }
  return null
}

// Node colors per state (border changes when active)
const NODE_BG: Record<string, string> = {
  backlog: '#170f04',
  tarefinha: '#1a1206',
  tarefa: '#1c1708',
  'em-progresso': '#1e1808',
  aguardando_humano: '#1e1208',
  bloqueada: '#1c0808',
  concluida: '#081808',
}
const NODE_BORDER: Record<string, string> = {
  backlog: '#2e2210',
  tarefinha: '#4a3418',
  tarefa: '#5a501a',
  'em-progresso': '#8b6914',
  aguardando_humano: '#7a4a10',
  bloqueada: '#7a2020',
  concluida: '#286028',
}
const COUNT_COLOR: Record<string, string> = {
  backlog: '#3a2e14',
  tarefinha: '#8b6914',
  tarefa: '#a09020',
  'em-progresso': '#c9a84c',
  aguardando_humano: '#c07830',
  bloqueada: '#cc5050',
  concluida: '#50aa50',
}

function smSVG(counts: Record<string, number>): string {
  // Bounding box: rightmost node (concluida) ends at x=728, bottom at y=230.
  // viewBox minX gives left margin; width = (728+pad) - minX
  const PAD = 16
  const minX = -PAD
  const maxX = 728 + PAD // concluida right edge + margin
  const maxY = 230 + PAD // bloqueada bottom edge + margin
  const svgW = maxX - minX
  const svgH = maxY

  const nodeSvg = nodes
    .map((n) => {
      const count = counts[n.id] ?? 0
      const bg = NODE_BG[n.id] ?? '#170f04'
      const border = count > 0 ? (NODE_BORDER[n.id] ?? '#5a3e1b') : '#261a08'
      const labelC = count > 0 ? '#c9a84c' : '#3e2e14'
      const countC = COUNT_COLOR[n.id] ?? '#3a2e14'
      return `
  <rect id="node-${n.id}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}"
        fill="${bg}" stroke="${border}" stroke-width="1.5" rx="2"/>
  <text x="${cx(n)}" y="${n.y + H / 2 - 5}" text-anchor="middle"
        font-size="9.5" fill="${labelC}" font-family="Palatino,serif">${STATE_LABELS[n.id] ?? n.id}</text>
  <text id="count-${n.id}" x="${cx(n)}" y="${n.y + H - 7}" text-anchor="middle"
        font-size="14" font-weight="bold" fill="${count > 0 ? countC : '#2e2010'}"
        font-family="Palatino,serif">${count}</text>`
    })
    .join('')

  const edgeSvg = edges
    .map((e) => {
      const dashed = e.dashed ? 'stroke-dasharray="4 3"' : ''
      const col = e.dashed ? '#2e2010' : '#4a3418'
      const d = edgePath(e)
      const mid = edgeMid(e)
      return `
  <path d="${d}" stroke="${col}" stroke-width="1.2" fill="none"
        marker-end="url(#arr)" ${dashed}/>
  ${
    mid
      ? `<text x="${mid.x}" y="${mid.y}" text-anchor="middle"
             font-size="8" fill="#2e2010" font-family="Palatino,serif">${e.label}</text>`
      : ''
  }`
    })
    .join('')

  return `<svg id="sm-svg" viewBox="${minX} 0 ${svgW} ${svgH}" width="100%" style="max-width:${svgW}px;display:block">
<defs>
  <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
    <path d="M0,0 L6,3 L0,6 Z" fill="#4a3418"/>
  </marker>
  <filter id="glow">
    <feGaussianBlur stdDeviation="3" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="glow-strong">
    <feGaussianBlur stdDeviation="5" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
${edgeSvg}
${nodeSvg}
</svg>`
}

// Project pipeline rows -------------------------------------------------------

const STATE_COLORS: Record<string, string> = {
  concluida: '#286028',
  'em-progresso': '#8b6914',
  tarefa: '#5a5018',
  tarefinha: '#3e2e14',
  aguardando_humano: '#7a4010',
  bloqueada: '#7a1818',
  backlog: '#221a08',
}

function taskBar(tasks: VaultProject['tasks']): string {
  if (!tasks.length) return '<span class="no-tasks">sem tasks</span>'
  const total = tasks.length
  return STATE_ORDER.map((s) => {
    const n = tasks.filter((t) => t.state === s).length
    if (!n) return ''
    const pct = ((n / total) * 100).toFixed(1)
    return `<div class="bar-seg" style="width:${pct}%;background:${STATE_COLORS[s] ?? '#222'}"
                  title="${STATE_LABELS[s]}: ${n}"></div>`
  }).join('')
}

function agentPipeline(p: VaultProject): string {
  const steps = p.pipeline?.length ? p.pipeline : p.agent ? [p.agent] : ['—']
  return steps
    .map(
      (a, i) =>
        `<span class="agent-chip" data-agent="${a}">${a}</span>${i < steps.length - 1 ? '<span class="pipe-arr">→</span>' : ''}`,
    )
    .join('')
}

function healthColor(h: string): string {
  return (
    { ok: '#286028', 'at-risk': '#8b6914', overdue: '#8a2020', idle: '#2e2010' }[h] ?? '#2e2010'
  )
}

function relTime(iso?: string): string {
  if (!iso) return '—'
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60_000) return 'agora'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m atrás`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h atrás`
  return `${Math.floor(d / 86_400_000)}d atrás`
}

function projectRows(projects: VaultProject[]): string {
  return projects
    .sort(
      (a, b) =>
        (({ high: 0, medium: 1, low: 2 })[a.priority] ?? 1) -
        ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 1),
    )
    .map((p) => {
      const h = (p as Record<string, unknown> & typeof p)['health'] as
        | { health: string }
        | undefined
      const health = h?.health ?? 'idle'
      const hc = healthColor(health)
      const pending = p.tasks.filter((t) => t.progresso < 100).length
      const blocked = p.tasks.filter(
        (t) => t.state === 'bloqueada' || t.state === 'aguardando_humano',
      ).length
      return `<tr class="proj-row" data-project="${p.id}">
  <td class="p-name">
    <span class="h-dot" style="background:${hc}"></span>${p.id}
  </td>
  <td><span class="badge t-${p.tipo}">${p.tipo}</span><span class="badge pr-${p.priority}">${p.priority}</span></td>
  <td class="p-pipeline">${agentPipeline(p)}</td>
  <td class="bar-cell"><div class="bar-wrap">${taskBar(p.tasks)}</div></td>
  <td class="p-counts">
    ${pending ? `<span class="pend">${pending} pend</span>` : ''}
    ${blocked ? `<span class="blk">${blocked} blk</span>` : ''}
  </td>
  <td class="p-run">${p.lastStatus === 'failed' ? '<span class="fail">✗</span> ' : ''}${relTime(p.lastRun)}</td>
</tr>`
    })
    .join('\n')
}

function depsSection(projects: VaultProject[]): string {
  const taskMap = new Map<string, string>()
  for (const p of projects)
    for (const t of p.tasks) taskMap.set(t.id, `${p.id} / ${t.title.slice(0, 36)}`)

  const items: string[] = []
  for (const p of projects)
    for (const t of p.tasks)
      if (t.depends?.length)
        items.push(`<li><span class="dep-t">${p.id} / ${t.title.slice(0, 40)}</span>
          <span class="dep-sep"> depende de </span>
          <span class="dep-n">${t.depends.map((d) => taskMap.get(d) ?? `<em>${d}</em>`).join(', ')}</span></li>`)

  if (!items.length) return ''
  return `<section><h2>Dependências de Tasks</h2><ul class="dep-list">${items.join('')}</ul></section>`
}

// Main render ----------------------------------------------------------------

export function renderFlow(projects: VaultProject[]): string {
  const counts: Record<string, number> = Object.fromEntries(STATE_ORDER.map((s) => [s, 0]))
  for (const p of projects)
    for (const t of p.tasks)
      if (Object.prototype.hasOwnProperty.call(counts, t.state))
        counts[t.state] = (counts[t.state] as number) + 1

  const totalTasks = Object.values(counts).reduce((a, b) => a + b, 0)

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Taverna — Fluxo</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
       background:#1a1408;color:#e8d5a3;padding:24px;min-height:100vh}
  a{color:#6b5030;text-decoration:none} a:hover{color:#c9a84c}

  header{display:flex;align-items:baseline;justify-content:space-between;
         flex-wrap:wrap;gap:12px;border-bottom:2px solid #5a3e1b;
         padding-bottom:12px;margin-bottom:28px}
  h1{color:#c9a84c;font-size:1.7rem;text-transform:uppercase;letter-spacing:.1em;
     display:inline;margin-left:16px}
  h2{color:#c9a84c;font-size:.95rem;text-transform:uppercase;letter-spacing:.06em;
     border-bottom:1px solid #2e2010;padding-bottom:6px;margin-bottom:14px}
  section{margin-bottom:32px}

  .status-bar{font-size:.85em;color:#6b5030;display:flex;align-items:center;gap:8px}
  .sse-dot{width:8px;height:8px;border-radius:50%;background:#2e2010;flex-shrink:0;
           transition:background .5s}
  .sse-dot.live{background:#4a8a4a}

  /* ── State machine ── */
  .sm-wrap{background:#120e04;border:1px solid #261808;padding:16px 20px;overflow-x:auto}
  .sm-legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:12px;font-size:.82em;color:#5a4020}
  .sm-legend span b{color:#c9a84c}

  /* Active run banner */
  .active-banner{display:none;margin-bottom:18px;border:1px solid #8b6914;
                 background:#1a1206;padding:10px 14px;font-size:.88em}
  .active-banner.show{display:block}
  .active-item{display:flex;align-items:center;gap:8px;padding:3px 0}
  .pulse-dot{width:9px;height:9px;border-radius:50%;background:#c9a84c;
             animation:pulse 1.2s ease-in-out infinite;flex-shrink:0}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}

  /* SVG node active highlight */
  .node-active rect{stroke:#c9a84c!important;stroke-width:2.5!important;
                    filter:url(#glow)!important}
  /* Particle travelling along an edge */
  .particle{r:3;fill:#c9a84c;opacity:0}
  @keyframes travel{0%{opacity:0}10%{opacity:1}90%{opacity:1}100%{opacity:0}}

  /* ── Project table ── */
  table{width:100%;border-collapse:collapse;font-size:.88em}
  th{color:#6b5030;text-align:left;padding:5px 10px;
     border-bottom:1px solid #261808;font-size:.78em;
     text-transform:uppercase;letter-spacing:.04em;font-weight:normal}
  td{padding:6px 10px;border-bottom:1px solid #1c1408;vertical-align:middle}
  tr.proj-row:hover td{background:#160e04}
  tr.proj-row.running td{background:#1c1608}
  tr.proj-row.running .p-name{color:#c9a84c}

  .p-name{display:flex;align-items:center;gap:6px;white-space:nowrap;
          color:#a08050;font-size:.9em}
  .h-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}

  .badge{border:1px solid #2e2010;padding:1px 5px;font-size:.72em;
         text-transform:uppercase;margin-right:3px;color:#5a4020}
  .t-USP{border-color:#1e3020;color:#4a7050}
  .t-BB{border-color:#1e2030;color:#405070}
  .pr-high{border-color:#4a1a1a;color:#9a4040}
  .pr-medium{border-color:#3a3010;color:#8a7030}
  .pr-low{border-color:#1a3020;color:#407040}

  .p-pipeline{white-space:nowrap}
  .agent-chip{color:#7a5030;font-size:.82em;padding:1px 5px;
              border:1px solid #2e1e0a;transition:color .3s,border-color .3s}
  .agent-chip.active{color:#c9a84c;border-color:#8b6914;
                     animation:chip-pulse 1s ease-in-out infinite}
  @keyframes chip-pulse{0%,100%{border-color:#8b6914}50%{border-color:#c9a84c}}
  .pipe-arr{color:#2e2010;margin:0 3px;font-size:.8em}

  .bar-cell{width:150px}
  .bar-wrap{height:9px;background:#1a1208;display:flex;overflow:hidden;border-radius:1px}
  .bar-seg{height:100%;transition:width .4s}
  .no-tasks{font-size:.75em;color:#2e2010}

  .p-counts{font-size:.8em;white-space:nowrap}
  .pend{color:#8b6914;margin-right:4px}
  .blk{color:#8a3030}
  .p-run{font-size:.8em;color:#4a3820;white-space:nowrap}
  .fail{color:#7a2020}

  /* Dependencies */
  .dep-list{list-style:none;display:flex;flex-direction:column;gap:6px}
  .dep-list li{font-size:.86em;display:flex;flex-wrap:wrap;gap:4px;align-items:baseline}
  .dep-t{color:#c9a84c} .dep-sep{color:#2e2010} .dep-n{color:#8b5014}
</style>
</head>
<body>

<header>
  <div>
    <a href="/dashboard">← Dashboard</a>
    <h1>Fluxo de Estados</h1>
  </div>
  <div class="status-bar">
    <span class="sse-dot" id="sse-dot"></span>
    <span id="upd">—</span>
    <span>· ${totalTasks} tasks · ${projects.length} projetos</span>
  </div>
</header>

<!-- Active runs banner -->
<div class="active-banner" id="active-banner"></div>

<section>
  <h2>Ciclo de Vida das Tasks</h2>
  <div class="sm-wrap" id="sm-wrap">${smSVG(counts)}</div>
  <div class="sm-legend" id="sm-legend">
    ${STATE_ORDER.map(
      (s) =>
        `<span data-state="${s}"><b id="lc-${s}">${counts[s] ?? 0}</b> ${STATE_LABELS[s]}</span>`,
    ).join(' · ')}
  </div>
</section>

<section>
  <h2>Projetos</h2>
  <table>
    <thead><tr>
      <th>Projeto</th><th>Tipo</th><th>Agente(s)</th>
      <th>Tasks</th><th></th><th>Último run</th>
    </tr></thead>
    <tbody id="proj-tbody">${projectRows(projects)}</tbody>
  </table>
</section>

${depsSection(projects)}

<script>
const BASE = window.location.origin

// ── Active runs ─────────────────────────────────────────────────────────────

function applyActiveRuns(runs) {
  const banner = document.getElementById('active-banner')
  // Banner
  if (!runs.length) {
    banner.classList.remove('show')
    banner.innerHTML = ''
  } else {
    banner.classList.add('show')
    banner.innerHTML = runs.map(r =>
      '<div class="active-item">' +
      '<span class="pulse-dot"></span>' +
      '<strong>' + r.agent + '</strong> executando <strong>' + r.project + '</strong>' +
      '<span style="color:#5a4020;font-size:.8em">  iniciado ' + relTime(r.startedAt) + '</span>' +
      '</div>'
    ).join('')
  }

  // Highlight project rows
  document.querySelectorAll('tr.proj-row').forEach(tr => {
    const id = tr.dataset.project
    const active = runs.some(r => r.project === id)
    tr.classList.toggle('running', active)
  })

  // Highlight agent chips
  document.querySelectorAll('.agent-chip').forEach(chip => {
    const agent = chip.dataset.agent
    const active = runs.some(r => r.agent === agent)
    chip.classList.toggle('active', active)
  })

  // Highlight SVG nodes for states that have active tasks
  // (we light up em-progresso when any run is active)
  const activeStates = runs.length ? ['em-progresso'] : []
  document.querySelectorAll('[id^="node-"]').forEach(el => {
    const state = el.id.replace('node-', '')
    el.closest('g')?.classList.toggle('node-active', activeStates.includes(state))
    // Direct rect manipulation (SVG)
    if (el.tagName === 'rect') {
      if (activeStates.includes(state)) {
        el.setAttribute('stroke', '#c9a84c')
        el.setAttribute('stroke-width', '2.5')
        el.setAttribute('filter', 'url(#glow)')
      } else {
        el.removeAttribute('filter')
      }
    }
  })

  // Animate particles along active edges when runs are active
  animateParticles(runs.length > 0)
}

// ── SVG particle animation ───────────────────────────────────────────────────
let particleInterval = null

function animateParticles(active) {
  clearInterval(particleInterval)
  // Remove old particles
  document.querySelectorAll('.particle').forEach(p => p.remove())
  if (!active) return

  const svg = document.querySelector('#sm-svg')
  if (!svg) return

  // Animate a dot along the tarefa → em-progresso edge (the "working" edge)
  const paths = svg.querySelectorAll('path[d]')
  // Pick the main-flow edges (non-dashed)
  const mainPaths = Array.from(paths).filter(p => !p.getAttribute('stroke-dasharray'))

  particleInterval = setInterval(() => {
    mainPaths.forEach((path, i) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('class', 'particle')
      circle.setAttribute('r', '3')
      circle.setAttribute('fill', '#c9a84c')

      const len = path.getTotalLength()
      svg.appendChild(circle)

      let start = null
      const duration = 1200 + i * 200

      function step(ts) {
        if (!start) start = ts
        const progress = Math.min((ts - start) / duration, 1)
        const eased = progress < .5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress
        const pt = path.getPointAtLength(eased * len)
        circle.setAttribute('cx', pt.x)
        circle.setAttribute('cy', pt.y)
        circle.setAttribute('opacity', progress < .1 ? progress * 10 :
                                        progress > .9 ? (1 - progress) * 10 : 1)
        if (progress < 1) requestAnimationFrame(step)
        else circle.remove()
      }
      requestAnimationFrame(step)
    })
  }, 2000)
}

// ── Refresh data ─────────────────────────────────────────────────────────────

function relTime(iso) {
  if (!iso) return '—'
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000)   return 'agora'
  if (d < 3600000) return Math.floor(d/60000) + 'm atrás'
  return Math.floor(d/3600000) + 'h atrás'
}

async function refresh() {
  try {
    const [stateRes, activeRes] = await Promise.all([
      fetch(BASE + '/api/state'),
      fetch(BASE + '/api/active'),
    ])
    const state  = await stateRes.json()
    const active = await activeRes.json()

    document.getElementById('upd').textContent =
      'atualizado ' + new Date(state.scannedAt).toLocaleTimeString('pt-BR')

    // Re-fetch rendered HTML fragments for state machine + table
    const html = await fetch(BASE + '/flow').then(r => r.text())
    const doc = new DOMParser().parseFromString(html, 'text/html')
    document.getElementById('sm-wrap').innerHTML  = doc.getElementById('sm-wrap').innerHTML
    document.getElementById('sm-legend').innerHTML = doc.getElementById('sm-legend').innerHTML
    document.getElementById('proj-tbody').innerHTML = doc.getElementById('proj-tbody').innerHTML

    applyActiveRuns(active)
  } catch { /* ignore */ }
}

// ── SSE ──────────────────────────────────────────────────────────────────────

const dot = document.getElementById('sse-dot')

function connectSSE() {
  const es = new EventSource(BASE + '/events')
  es.addEventListener('connected', () => dot.classList.add('live'))
  es.addEventListener('update', () => refresh())
  es.addEventListener('agent_active', e => {
    try { applyActiveRuns(JSON.parse(e.data)) } catch { /* ignore */ }
  })
  es.onerror = () => {
    dot.classList.remove('live')
    animateParticles(false)
    setTimeout(connectSSE, 5000)
    es.close()
  }
}

connectSSE()
setInterval(refresh, 60_000)

// ── Initial active state ─────────────────────────────────────────────────────
fetch(BASE + '/api/active').then(r => r.json()).then(applyActiveRuns).catch(() => {})
</script>
</body>
</html>`
}
