import type { VaultProject } from '../../vault/types.js'
import { computeHealth } from '../../manager/observability/index.js'

function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m atrás`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h atrás`
  return `${Math.floor(diff / 86_400_000)}d atrás`
}

function nextRunIn(project: VaultProject): string {
  if (project.runEvery === 'never') return 'manual'
  const freqMs: Record<string, number> = {
    hourly: 3_600_000,
    daily: 86_400_000,
    weekly: 604_800_000,
    monthly: 2_592_000_000,
  }
  const freq = freqMs[project.runEvery]
  if (!freq || !project.lastRun) return project.runEvery
  const next = new Date(project.lastRun).getTime() + freq
  const diff = next - Date.now()
  if (diff <= 0) return 'agora'
  if (diff < 3_600_000) return `em ${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `em ${Math.floor(diff / 3_600_000)}h`
  return `em ${Math.floor(diff / 86_400_000)}d`
}

function healthClass(h: string): string {
  return { ok: 'h-ok', 'at-risk': 'h-risk', overdue: 'h-over', idle: 'h-idle' }[h] ?? 'h-idle'
}

function healthLabel(h: string): string {
  return { ok: '✓ ok', 'at-risk': '⚠ risco', overdue: '✗ vencida', idle: '· idle' }[h] ?? h
}

function pipelineHtml(project: VaultProject): string {
  const agents = project.pipeline?.length
    ? project.pipeline
    : project.agent
      ? [project.agent]
      : ['—']
  return agents
    .map((a) => `<span class="pipe-step">${a}</span>`)
    .join('<span class="pipe-arrow">→</span>')
}

function projectCard(p: VaultProject, dailyCost: number): string {
  const h = computeHealth(p)
  const pending = p.tasks.filter((t) => t.progresso < 100).length
  const blocked = p.tasks.filter(
    (t) => t.progresso < 100 && (t.state === 'bloqueada' || t.state === 'aguardando_humano'),
  ).length
  const lastStatus = p.lastStatus ?? 'idle'
  const costStr = dailyCost > 0 ? `$${dailyCost.toFixed(4)}` : '$0'

  return `
  <div class="card" data-id="${p.id}">
    <div class="card-head">
      <div>
        <span class="card-id">${p.id}</span>
        <span class="badge tipo">${p.tipo}</span>
        <span class="badge prio prio-${p.priority}">${p.priority}</span>
      </div>
      <div class="card-actions">
        <button onclick="runProject('${p.id}')" title="Rodar este projeto">▶</button>
      </div>
    </div>

    <div class="pipeline">${pipelineHtml(p)}</div>

    <div class="card-meta">
      <span class="${healthClass(h.health)}">${healthLabel(h.health)}</span>
      <span class="sep">·</span>
      <span>${pending} task${pending !== 1 ? 's' : ''} pendente${pending !== 1 ? 's' : ''}</span>
      ${blocked > 0 ? `<span class="sep">·</span><span class="h-over">${blocked} bloqueada${blocked !== 1 ? 's' : ''}</span>` : ''}
    </div>

    <div class="progress-row">
      <progress value="${h.progresso}" max="100"></progress>
      <span class="pct">${h.progresso}%</span>
    </div>

    <div class="card-footer">
      <span class="status-dot ${lastStatus}"></span>
      <span>${relativeTime(p.lastRun)}</span>
      <span class="sep">·</span>
      <span>próximo: ${nextRunIn(p)}</span>
      <span class="sep">·</span>
      <span class="cost">${costStr} hoje</span>
    </div>
  </div>`
}

export function renderDashboard(
  projects: VaultProject[],
  dailyCosts: Record<string, number>,
): string {
  const totalCost = Object.values(dailyCosts).reduce((s, v) => s + v, 0)
  const cards = projects
    .sort((a, b) => {
      const po = { high: 0, medium: 1, low: 2 }
      return (po[a.priority] ?? 1) - (po[b.priority] ?? 1)
    })
    .map((p) => projectCard(p, dailyCosts[p.id] ?? 0))
    .join('\n')

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taverna</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    background: #1a1408;
    color: #e8d5a3;
    padding: 24px;
    min-height: 100vh;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    border-bottom: 2px solid #5a3e1b;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }

  h1 {
    color: #c9a84c;
    font-size: 2rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .status-bar {
    font-size: 0.85em;
    color: #8b6914;
  }

  .sse-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #444;
    margin-right: 6px;
    vertical-align: middle;
  }
  .sse-dot.live { background: #6aaa6a; }

  .actions { display: flex; gap: 8px; }

  button {
    background: transparent;
    color: #c9a84c;
    border: 1px solid #8b6914;
    padding: 5px 14px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9em;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    transition: background 0.15s, color 0.15s;
  }
  button:hover { background: #8b6914; color: #1a1408; }
  button:active { background: #c9a84c; color: #1a1408; }
  button:disabled { opacity: 0.4; cursor: default; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 16px;
  }

  .card {
    border: 1px solid #5a3e1b;
    background: #120e04;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card:hover { border-color: #8b6914; }

  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .card-id {
    color: #c9a84c;
    font-size: 1.15em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-right: 8px;
  }

  .badge {
    border: 1px solid;
    padding: 1px 7px;
    font-size: 0.78em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge.tipo { border-color: #5a3e1b; color: #8b6914; }
  .badge.prio-high { border-color: #7a4a4a; color: #cc7070; }
  .badge.prio-medium { border-color: #6b6020; color: #c9a84c; }
  .badge.prio-low { border-color: #2a4a2a; color: #5a8a5a; }

  .pipeline {
    font-size: 0.88em;
    color: #a08050;
  }
  .pipe-step { color: #c9a84c; }
  .pipe-arrow { margin: 0 6px; color: #5a3e1b; }

  .card-meta {
    font-size: 0.88em;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .sep { color: #5a3e1b; }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  progress {
    flex: 1;
    height: 6px;
    appearance: none;
    border: none;
    background: #2a1e0a;
  }
  progress::-webkit-progress-bar { background: #2a1e0a; }
  progress::-webkit-progress-value { background: #8b6914; }
  progress::-moz-progress-bar { background: #8b6914; }
  .pct { font-size: 0.85em; color: #8b6914; min-width: 36px; text-align: right; }

  .card-footer {
    font-size: 0.82em;
    color: #6b5030;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .cost { color: #8b6914; margin-left: auto; }

  .status-dot {
    display: inline-block;
    width: 7px; height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot.success { background: #4a7a4a; }
  .status-dot.failed  { background: #7a4a4a; }
  .status-dot.idle    { background: #3a3020; }

  .h-ok   { color: #6aaa6a; }
  .h-risk { color: #c9a84c; }
  .h-over { color: #cc6666; }
  .h-idle { color: #5a4a30; }

  .toast {
    position: fixed;
    bottom: 24px; right: 24px;
    background: #2a1e0a;
    border: 1px solid #8b6914;
    color: #e8d5a3;
    padding: 10px 18px;
    font-size: 0.88em;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  }
  .toast.show { opacity: 1; }

  .total-cost {
    font-size: 0.9em;
    color: #8b6914;
  }
</style>
</head>
<body>

<header>
  <h1>Taverna</h1>
  <div class="header-right">
    <a href="/flow" style="color:#8b6914;font-size:.9em;text-decoration:none;border:1px solid #3a2e14;padding:4px 10px;white-space:nowrap">Fluxo →</a>
<a href="/infraestrutura" style="color:#8b6914;font-size:.9em;text-decoration:none;border:1px solid #3a2e14;padding:4px 10px;white-space:nowrap">Infra →</a>
    <span class="total-cost" id="total-cost">$${totalCost.toFixed(4)} hoje</span>
    <span class="status-bar">
      <span class="sse-dot" id="sse-dot"></span>
      <span id="updated-at">—</span>
    </span>
    <div class="actions">
      <button id="btn-execute" onclick="triggerExecute()">▶ Executar</button>
      <button id="btn-drain" onclick="triggerDrain()">⚡ Drain</button>
    </div>
  </div>
</header>

<div class="grid" id="grid">
${cards}
</div>

<div class="toast" id="toast"></div>

<script>
  const BASE = window.location.origin

  function toast(msg, ok = true) {
    const el = document.getElementById('toast')
    el.textContent = msg
    el.style.borderColor = ok ? '#4a7a4a' : '#7a4a4a'
    el.classList.add('show')
    setTimeout(() => el.classList.remove('show'), 3000)
  }

  async function post(path) {
    try {
      const r = await fetch(BASE + path, { method: 'POST' })
      const j = await r.json()
      toast(j.message ?? 'iniciado')
    } catch (e) {
      toast(String(e), false)
    }
  }

  function triggerExecute() {
    document.getElementById('btn-execute').disabled = true
    post('/api/run').finally(() => setTimeout(() =>
      document.getElementById('btn-execute').disabled = false, 3000))
  }

  function triggerDrain() {
    document.getElementById('btn-drain').disabled = true
    post('/api/drain').finally(() => setTimeout(() =>
      document.getElementById('btn-drain').disabled = false, 5000))
  }

  function runProject(id) {
    post('/api/run/' + encodeURIComponent(id))
  }

  async function refresh() {
    try {
      const r = await fetch(BASE + '/api/state')
      const data = await r.json()
      document.getElementById('updated-at').textContent =
        'atualizado ' + new Date(data.scannedAt).toLocaleTimeString('pt-BR')
      const total = Object.values(data.costs ?? {}).reduce((s, v) => s + v, 0)
      document.getElementById('total-cost').textContent = '$' + total.toFixed(4) + ' hoje'
      // Re-render grid
      const grid = document.getElementById('grid')
      grid.innerHTML = data.html ?? grid.innerHTML
    } catch { /* ignore */ }
  }

  // SSE for live updates
  const dot = document.getElementById('sse-dot')
  function connectSSE() {
    const es = new EventSource(BASE + '/events')
    es.addEventListener('connected', () => dot.classList.add('live'))
    es.addEventListener('update', () => refresh())
    es.onerror = () => {
      dot.classList.remove('live')
      setTimeout(connectSSE, 5000)
      es.close()
    }
  }
  connectSSE()

  // Update relative timestamps every minute
  setInterval(refresh, 60_000)

  document.getElementById('updated-at').textContent =
    'atualizado ' + new Date().toLocaleTimeString('pt-BR')
</script>
</body>
</html>`
}
