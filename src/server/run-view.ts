export function renderRunPage(projectId: string, publicUrl?: string): string {
  const escapedId = JSON.stringify(projectId)
  const baseUrl = publicUrl ?? ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>taverna / ${projectId}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d1117; color: #e6edf3; font-family: 'Cascadia Code', 'Fira Mono', monospace; font-size: 13px; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }

    header { display: flex; align-items: center; gap: 1rem; padding: .6rem 1rem; border-bottom: 1px solid #21262d; background: #161b22; }
    header h1 { font-size: 14px; font-weight: 600; color: #e6edf3; flex: 1; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
    .badge-idle    { background: #21262d; color: #8b949e; }
    .badge-running { background: #1a3f1a; color: #3fb950; }
    .badge-done    { background: #1a2a3f; color: #58a6ff; }
    .badge-error   { background: #3f1a1a; color: #f85149; }

    nav.tabs { display: flex; gap: 0; border-bottom: 1px solid #21262d; background: #161b22; padding: 0 1rem; }
    .tab-btn { background: none; border: none; color: #8b949e; cursor: pointer; padding: .5rem 1rem; font: inherit; font-size: 12px; border-bottom: 2px solid transparent; }
    .tab-btn:hover { color: #e6edf3; }
    .tab-btn.active { color: #e6edf3; border-bottom-color: #f78166; }

    .panel { display: none; padding: 1rem; height: calc(100vh - 82px); overflow-y: auto; }
    .panel.active { display: flex; flex-direction: column; gap: .75rem; }

    .meta-row { display: flex; gap: 1.5rem; font-size: 11px; color: #8b949e; flex-wrap: wrap; }
    .meta-row span { white-space: nowrap; }
    .meta-row strong { color: #e6edf3; }

    #log {
      flex: 1; background: #010409; border: 1px solid #21262d; border-radius: 6px;
      padding: .75rem; white-space: pre-wrap; overflow-y: auto; min-height: 200px;
      line-height: 1.5; color: #c9d1d9; font-size: 12px;
    }

    .actions { display: flex; gap: .5rem; align-items: center; }
    button.run-btn {
      background: #238636; color: #fff; border: none; padding: .4rem .9rem;
      border-radius: 6px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600;
    }
    button.run-btn:hover { background: #2ea043; }
    button.run-btn:disabled { background: #21262d; color: #8b949e; cursor: default; }
    button.sec-btn {
      background: #21262d; color: #e6edf3; border: 1px solid #30363d; padding: .35rem .8rem;
      border-radius: 6px; cursor: pointer; font: inherit; font-size: 12px;
    }
    button.sec-btn:hover { background: #30363d; }

    #prompt-text {
      flex: 1; background: #010409; border: 1px solid #21262d; border-radius: 6px;
      padding: .75rem; white-space: pre-wrap; overflow-y: auto;
      line-height: 1.5; color: #c9d1d9; font-size: 12px;
    }
    .prompt-meta { font-size: 11px; color: #8b949e; }

    #history-list { display: flex; flex-direction: column; gap: .25rem; }
    .snap-item {
      background: #161b22; border: 1px solid #21262d; border-radius: 4px; padding: .4rem .7rem;
      cursor: pointer; font-size: 11px; color: #8b949e; display: flex; gap: 1rem;
    }
    .snap-item:hover { border-color: #58a6ff; color: #e6edf3; }
    .snap-item strong { color: #e6edf3; }
  </style>
</head>
<body>
<header>
  <a href="/dashboard">← dashboard</a>
  <h1>${projectId}</h1>
  <span id="status-badge" class="badge badge-idle">aguardando</span>
</header>

<nav class="tabs">
  <button class="tab-btn active" data-tab="exec">Execução</button>
  <button class="tab-btn" data-tab="prompt">Prompt</button>
</nav>

<div id="tab-exec" class="panel active">
  <div class="meta-row" id="meta">
    <span>projeto: <strong>${projectId}</strong></span>
  </div>
  <pre id="log">aguardando execução...</pre>
  <div class="actions">
    <button class="run-btn" id="btn-run" onclick="startSession()">▶ Iniciar sessão</button>
    <button class="sec-btn" onclick="document.getElementById('log').textContent = ''">limpar</button>
  </div>
</div>

<div id="tab-prompt" class="panel">
  <div class="actions">
    <button class="sec-btn" onclick="loadDryRun()">🔍 Dry Run</button>
    <span class="prompt-meta" id="prompt-meta"></span>
  </div>
  <div id="history-list"></div>
  <pre id="prompt-text">Clique em "Dry Run" para ver o prompt que será enviado ao agente.</pre>
</div>

<script>
  const PROJECT = ${escapedId}
  const BASE_URL = ${JSON.stringify(baseUrl)}

  // ── SSE ──────────────────────────────────────────────────────────────────
  let es = null

  function connectSSE() {
    if (es) es.close()
    es = new EventSource('/run/' + encodeURIComponent(PROJECT) + '/events')

    es.addEventListener('idle', () => {
      setBadge('idle', 'aguardando')
      document.getElementById('btn-run').disabled = false
    })

    es.addEventListener('agent_active', (e) => {
      const d = JSON.parse(e.data)
      setBadge('running', '▶ executando')
      document.getElementById('btn-run').disabled = true
      const meta = document.getElementById('meta')
      meta.innerHTML = [
        'projeto: <strong>' + PROJECT + '</strong>',
        'agente: <strong>' + (d.agent || '?') + '</strong>',
        'sessão: <strong>' + (d.sessionId || '?').slice(0, 8) + '…</strong>',
        'iniciado: <strong>' + relTime(d.startedAt) + '</strong>',
      ].map(s => '<span>' + s + '</span>').join('')
    })

    es.addEventListener('agent_log', (e) => {
      const d = JSON.parse(e.data)
      const log = document.getElementById('log')
      if (log.textContent === 'aguardando execução...') log.textContent = ''
      log.textContent += d.message
      log.scrollTop = log.scrollHeight
    })

    es.addEventListener('agent_done', () => {
      setBadge('done', '✓ concluído')
      document.getElementById('btn-run').disabled = false
    })

    es.onerror = () => {
      setTimeout(connectSSE, 3000)
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function startSession() {
    document.getElementById('btn-run').disabled = true
    document.getElementById('log').textContent = 'iniciando sessão...'
    setBadge('running', '▶ iniciando')
    await fetch('/api/session/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: PROJECT }),
    })
  }

  async function loadDryRun() {
    document.getElementById('prompt-text').textContent = 'carregando...'
    document.getElementById('prompt-meta').textContent = ''
    try {
      const r = await fetch('/api/prompt/' + encodeURIComponent(PROJECT))
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      document.getElementById('prompt-text').textContent = d.prompt
      document.getElementById('prompt-meta').textContent =
        d.agent + ' · ' + d.mode + ' · ' + d.char_total + ' chars · ' + d.task_count + ' tasks'
    } catch (e) {
      document.getElementById('prompt-text').textContent = 'Erro: ' + e.message
    }
  }

  async function loadHistory() {
    const r = await fetch('/api/prompt/' + encodeURIComponent(PROJECT) + '/history')
    const items = await r.json()
    const list = document.getElementById('history-list')
    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = '<span style="color:#8b949e;font-size:11px">sem histórico de prompts</span>'
      return
    }
    list.innerHTML = items.map((s) =>
      '<div class="snap-item" onclick="loadSnapshot(' + JSON.stringify(s.ts) + ')">'
      + '<strong>' + s.ts.slice(0, 19).replace('T', ' ') + '</strong>'
      + '<span>' + s.agent + '</span>'
      + '<span>' + s.mode + '</span>'
      + '<span>' + s.char_total + ' chars</span>'
      + '<span>' + s.task_count + ' tasks</span>'
      + '</div>'
    ).join('')
  }

  async function loadSnapshot(ts) {
    document.getElementById('prompt-text').textContent = 'carregando...'
    const r = await fetch('/api/prompt/' + encodeURIComponent(PROJECT) + '/diff?a=' + encodeURIComponent(ts) + '&b=' + encodeURIComponent(ts))
    const d = await r.json()
    // simple: just show the snapshot prompt via dry-run API is not available — show hint
    document.getElementById('prompt-text').textContent = 'snapshot: ' + ts + '\\n(use /api/prompt/' + PROJECT + '/diff?a=...&b=... para comparar)'
  }

  // ── Utils ─────────────────────────────────────────────────────────────────
  function setBadge(type, text) {
    const b = document.getElementById('status-badge')
    b.className = 'badge badge-' + type
    b.textContent = text
  }

  function relTime(iso) {
    if (!iso) return '?'
    const diff = Date.now() - new Date(iso).getTime()
    if (diff < 60000) return 'agora'
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm atrás'
    return Math.floor(diff / 3600000) + 'h atrás'
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'))
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active')
      if (btn.dataset.tab === 'prompt') loadHistory()
    })
  })

  connectSSE()
</script>
</body>
</html>`
}
