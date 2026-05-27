export function renderSlides(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Taverna — Orquestrador de Agentes Claude</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/night.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/monokai.css" />
  <style>
    :root {
      --amber: #f59e0b;
      --amber-dim: #92400e;
      --text-muted: #a8a29e;
    }
    .reveal { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
    .reveal h1, .reveal h2, .reveal h3 { color: var(--amber); text-transform: none; letter-spacing: -0.02em; }
    .reveal h1 { font-size: 2.2em; }
    .reveal h2 { font-size: 1.5em; }
    .reveal section { text-align: left; }
    .reveal .slides section.center { text-align: center; }

    .tag { display: inline-block; background: var(--amber-dim); color: var(--amber); border: 1px solid var(--amber); border-radius: 4px; padding: 2px 10px; font-size: 0.55em; font-weight: 600; vertical-align: middle; margin-left: 8px; letter-spacing: 0.05em; }

    .card-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px; }
    .card { background: rgba(245,158,11,.08); border: 1px solid rgba(245,158,11,.3); border-radius: 8px; padding: 18px 16px; }
    .card .card-title { color: var(--amber); font-weight: 700; font-size: 0.8em; margin-bottom: 8px; }
    .card p, .card li { font-size: 0.6em; color: #d6d3d1; margin: 4px 0; }
    .card ul { margin: 0; padding-left: 16px; }

    .flow { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
    .flow-step { display: flex; align-items: flex-start; gap: 14px; }
    .flow-num { background: var(--amber); color: #1c1917; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.65em; flex-shrink: 0; margin-top: 2px; }
    .flow-body { font-size: 0.65em; color: #e7e5e4; line-height: 1.5; }
    .flow-body strong { color: var(--amber); }
    .flow-body code { background: #292524; color: #86efac; padding: 1px 6px; border-radius: 3px; font-size: 0.92em; }

    .mod-table { width: 100%; border-collapse: collapse; font-size: 0.6em; margin-top: 16px; }
    .mod-table th { color: var(--amber); text-align: left; padding: 6px 10px; border-bottom: 1px solid rgba(245,158,11,.4); font-weight: 600; }
    .mod-table td { padding: 7px 10px; color: #d6d3d1; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: top; }
    .mod-table td:first-child { color: #86efac; font-family: monospace; white-space: nowrap; }

    .arch { font-family: monospace; font-size: 0.58em; color: #a8a29e; line-height: 1.7; background: #1c1917; border: 1px solid #44403c; border-radius: 8px; padding: 18px 22px; margin-top: 16px; }
    .arch .hl { color: var(--amber); } .arch .grn { color: #86efac; } .arch .blu { color: #93c5fd; } .arch .pnk { color: #f9a8d4; }

    .tree { font-family: monospace; font-size: 0.6em; color: #a8a29e; line-height: 1.8; }
    .tree .dir { color: var(--amber); } .tree .file { color: #d6d3d1; } .tree .meta { color: #6b7280; font-size: 0.85em; }

    .event-box { background: #1c1917; border: 1px solid #44403c; border-radius: 8px; padding: 14px 18px; font-size: 0.52em; color: #86efac; font-family: monospace; margin-top: 12px; line-height: 1.7; word-break: break-all; }
    .event-box .key { color: #93c5fd; } .event-box .val { color: #fde68a; } .event-box .str { color: #86efac; }

    .stack { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; }
    .stack-row { display: flex; align-items: center; gap: 10px; }
    .stack-label { font-size: 0.6em; color: #d6d3d1; min-width: 180px; }
    .stack-arrow { color: var(--amber); font-size: 0.9em; }
    .stack-detail { font-size: 0.55em; color: #78716c; font-style: italic; }

    .pill { display: inline-block; border-radius: 999px; padding: 2px 12px; font-size: 0.55em; font-weight: 600; margin: 3px; }
    .pill-green  { background: #14532d; color: #86efac; }
    .pill-blue   { background: #1e3a5f; color: #93c5fd; }
    .pill-amber  { background: var(--amber-dim); color: var(--amber); }
    .pill-red    { background: #7f1d1d; color: #fca5a5; }
    .pill-purple { background: #3b0764; color: #d8b4fe; }

    .title-logo { font-size: 5em; margin-bottom: 0; line-height: 1; }
    .title-sub  { color: #a8a29e; font-size: 0.85em; margin-top: 0; }
    .title-meta { margin-top: 40px; font-size: 0.55em; color: #78716c; }

    .cmd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
    .cmd-group-title { color: var(--amber); font-size: 0.6em; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
    .cmd-group code { display: block; font-size: 0.52em; color: #86efac; font-family: monospace; padding: 3px 0; line-height: 1.6; }
    .cmd-group .cmd-note { color: #78716c; font-size: 0.85em; }

    .metaphor { background: linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.03)); border-left: 3px solid var(--amber); border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 20px 0; font-size: 0.7em; color: #e7e5e4; line-height: 1.7; }
    .metaphor em { color: var(--amber); font-style: normal; font-weight: 600; }

    .highlight-bar { background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.25); border-radius: 6px; padding: 10px 16px; font-size: 0.62em; color: #d6d3d1; margin-top: 12px; }
    .highlight-bar strong { color: var(--amber); }

    /* Back link */
    .back-link {
      position: fixed;
      top: 14px;
      left: 14px;
      z-index: 100;
      font-size: 0.78em;
      color: #8b6914;
      text-decoration: none;
      background: rgba(26,20,8,.85);
      border: 1px solid #5a3e1b;
      padding: 4px 12px;
      font-family: 'Palatino Linotype', Palatino, serif;
      letter-spacing: 0.04em;
      transition: color 0.15s, border-color 0.15s;
    }
    .back-link:hover { color: #c9a84c; border-color: #8b6914; }

    .reveal pre { border-radius: 6px; }
    .reveal pre code { font-size: 0.75em; max-height: 400px; }
    .reveal code { color: #86efac; }
  </style>
</head>
<body>

<a class="back-link" href="/dashboard">← taverna</a>

<div class="reveal">
  <div class="slides">

    <!-- ① TÍTULO -->
    <section class="center" data-background-gradient="radial-gradient(ellipse at 30% 40%, #1c1410 0%, #0c0a09 80%)">
      <p class="title-logo">🛢️</p>
      <h1 style="font-size:2.8em; margin:0">Taverna</h1>
      <p class="title-sub">Orquestrador de Agentes Claude Code</p>
      <div class="metaphor" style="margin-top:36px; text-align:left; max-width:640px; margin-inline:auto">
        Um <em>deadpool de taverna</em>: projetos são <em>contratos</em>, agentes são <em>mercenários</em>,
        o executor é o <em>dono</em> que distribui os contratos para quem é elegível no momento.
      </div>
      <p class="title-meta">TypeScript · Node.js · Claude CLI · Obsidian Vault</p>
      <div style="margin-top:28px; display:flex; justify-content:center; gap:12px; flex-wrap:wrap">
        <a href="http://start:3000" target="_blank" style="color:#86efac;font-size:0.6em;text-decoration:none;background:rgba(134,239,172,.08);border:1px solid rgba(134,239,172,.25);padding:5px 16px;border-radius:4px">📊 Grafana :3000</a>
        <a href="http://start:3900" target="_blank" style="color:#93c5fd;font-size:0.6em;text-decoration:none;background:rgba(147,197,253,.08);border:1px solid rgba(147,197,253,.25);padding:5px 16px;border-radius:4px">📦 Copyparty :3900</a>
        <a href="/infraestrutura" style="color:#f59e0b;font-size:0.6em;text-decoration:none;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);padding:5px 16px;border-radius:4px">⚙️ Arquitetura & Infra →</a>
      </div>
    </section>

    <!-- ② O QUE É -->
    <section>
      <h2>O que é Taverna?</h2>
      <div style="font-size:0.7em; color:#d6d3d1; margin-top:12px; line-height:1.8">
        Um <strong style="color:var(--amber)">motor de automação headless</strong> que:
      </div>
      <div class="flow" style="margin-top:16px">
        <div class="flow-step"><div class="flow-num">1</div><div class="flow-body">Lê projetos de um <strong>vault Obsidian</strong> — source of truth em arquivos markdown</div></div>
        <div class="flow-step"><div class="flow-num">2</div><div class="flow-body">Constrói <strong>prompts precisos</strong> com diretiva do agente + tasks pendentes + contexto do projeto</div></div>
        <div class="flow-step"><div class="flow-num">3</div><div class="flow-body">Spawna instâncias do <code>claude</code> CLI com <code>--print --output-format json</code></div></div>
        <div class="flow-step"><div class="flow-num">4</div><div class="flow-body">Emite eventos de observabilidade → <strong>Loki → Grafana</strong></div></div>
      </div>
      <div class="highlight-bar" style="margin-top:20px">
        <strong>Não é um chatbot.</strong> Roda em segundo plano via systemd, observável via tmux.
      </div>
    </section>

    <!-- ③ ARQUITETURA -->
    <section>
      <h2>Arquitetura em camadas</h2>
      <div class="arch">
        <span class="hl">systemd timers</span><br>
        &nbsp;&nbsp;└─ <span class="hl">taverna execute</span> / <span class="hl">taverna schedule</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ <span class="grn">executor.ts</span> — spawna <code>claude --print --output-format json</code><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ <span class="blu">prompt.ts</span> — constrói o prompt (diretiva + tasks + contexto)<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ <span class="blu">loki.ts</span> — emite eventos JSON<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ <span class="blu">budget.ts</span> — guarda orçamento diário por projeto<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ <span class="blu">active.ts</span> — registra runs em /tmp/taverna-active/<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ <span class="blu">matrix.ts</span> — notificações Matrix opcionais<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ <span class="pnk">vault/</span> — lê projetos, tasks, agentes do filesystem<br>
        <br>
        <span class="hl">taverna serve</span> <span style="color:#6b7280">(porta 2948, always-on)</span><br>
        &nbsp;&nbsp;└─ <span class="grn">server/routes.ts</span> — HTTP + SSE<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ <span class="blu">dashboard.ts</span> — HTML com cards por projeto<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ <span class="blu">flow.ts</span> — máquina de estados de tasks
      </div>
    </section>

    <!-- ④ VAULT -->
    <section>
      <h2>Estrutura do Vault <span class="tag">Obsidian</span></h2>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:16px">
        <div>
          <div class="tree">
            <span class="dir">10_Projects/</span><br>
            &nbsp;&nbsp;<span class="dir">&lt;id&gt;/</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;<span class="file">&lt;id&gt;.md</span> <span class="meta">← frontmatter</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;<span class="dir">tasks/</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="file">&lt;task-id&gt;.md</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="dir">archive/</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;<span class="file">logbook.md</span><br>
            <br>
            <span class="dir">60_Agents/</span><br>
            &nbsp;&nbsp;<span class="dir">1_Directives/</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;<span class="dir">&lt;agent&gt;/</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="file">&lt;agent&gt;.md</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="dir">modes/</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="file">conventions.md</span><br>
            &nbsp;&nbsp;<span class="dir">2_Logbooks/</span><br>
            &nbsp;&nbsp;<span class="dir">4_Config/</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;<span class="file">costs.json</span><br>
            &nbsp;&nbsp;<span class="dir">5_Inbox/</span>
          </div>
        </div>
        <div>
          <div class="card" style="margin-bottom:12px">
            <div class="card-title">Frontmatter de Projeto</div>
            <p style="font-family:monospace; font-size:0.85em; color:#86efac; line-height:1.8">
              id: PSI3451<br>tipo: USP<br>agent: '@study-assistant'<br>run_every: daily<br>budget_usd_daily: 0.50<br>_last_run: 2026-05-21T…<br>_last_status: success
            </p>
          </div>
          <div class="card">
            <div class="card-title">Frontmatter de Task</div>
            <p style="font-family:monospace; font-size:0.85em; color:#86efac; line-height:1.8">
              progresso: 30<br>prioridade: high<br>deadline: 2026-05-23<br>state: em-progresso<br>depends: [02-outra]<br>_session_id: &lt;uuid&gt;
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ⑤ FLUXO -->
    <section>
      <h2>Fluxo de Execução de um Agente</h2>
      <div class="flow">
        <div class="flow-step"><div class="flow-num">1</div><div class="flow-body"><strong>scanVault</strong> — lê todos os projetos em <code>10_Projects/</code> e agentes em <code>60_Agents/1_Directives/</code></div></div>
        <div class="flow-step"><div class="flow-num">2</div><div class="flow-body"><strong>isProjectDue</strong> — verifica <code>run_every</code> vs <code>_last_run</code></div></div>
        <div class="flow-step"><div class="flow-num">3</div><div class="flow-body"><strong>checkBudget</strong> — compara custo acumulado do dia com <code>budget_usd_daily</code></div></div>
        <div class="flow-step"><div class="flow-num">4</div><div class="flow-body"><strong>buildPrompt</strong> — diretiva do agente + Task Completion Protocol + tasks pendentes + target</div></div>
        <div class="flow-step"><div class="flow-num">5</div><div class="flow-body"><strong>spawnClaude</strong> — <code>claude --print --output-format json</code> via stdin, sessão tmux para observabilidade</div></div>
        <div class="flow-step"><div class="flow-num">6</div><div class="flow-body"><strong>parseResult</strong> — tokens contados, custo calculado, <code>RESULTADO:</code> extraído</div></div>
        <div class="flow-step"><div class="flow-num">7</div><div class="flow-body"><strong>updateProjectStatus</strong> — <code>_last_run</code>, <code>_last_status</code>, <code>_runs_total</code> atualizados no vault</div></div>
      </div>
    </section>

    <!-- ⑥ AGENTES -->
    <section>
      <h2>Agentes <span class="tag">60_Agents</span></h2>
      <div class="card-grid">
        <div class="card">
          <div class="card-title">@dev-agent</div>
          <ul><li>Projetos de infra e código</li><li>Qualquer horário</li><li>Tipo: <code>*</code></li></ul>
        </div>
        <div class="card">
          <div class="card-title">@study-assistant</div>
          <ul><li>Matérias USP</li><li>09:00 e 17h+</li><li>Detecta modo automático:<br>vhdl, matlab, python, teoria…</li></ul>
        </div>
        <div class="card">
          <div class="card-title">@planner</div>
          <ul><li>Side projects (BB)</li><li>Qualquer horário</li><li>Tipo: <code>BB</code></li></ul>
        </div>
      </div>
      <div class="highlight-bar" style="margin-top:16px">
        <strong>Pipeline:</strong> agentes podem ser encadeados — <code>@tdd-writer → @dev-agent → @reviewer</code> — output de cada um vira contexto do próximo.
      </div>
      <div style="margin-top:12px; font-size:0.62em; color:#a8a29e">
        <strong style="color:var(--amber)">Permissões:</strong>
        se o agente declara <code>permissions:</code> no frontmatter → modo <code>default</code> + <code>--allowedTools</code>.
        Sem permissões → <code>bypassPermissions</code> (padrão).
      </div>
    </section>

    <!-- ⑦ TASK COMPLETION PROTOCOL -->
    <section>
      <h2>Task Completion Protocol</h2>
      <div style="font-size:0.68em; color:#d6d3d1; margin-top:12px">
        Todo agente recebe no prompt um protocolo obrigatório. Ao terminar uma task:
      </div>
      <div class="flow" style="margin-top:14px">
        <div class="flow-step"><div class="flow-num">A</div><div class="flow-body">Atualiza <code>progresso:</code> no frontmatter da task</div></div>
        <div class="flow-step"><div class="flow-num">B</div><div class="flow-body">Move para <code>tasks/archive/</code> se <code>progresso: 100</code></div></div>
        <div class="flow-step"><div class="flow-num">C</div><div class="flow-body">Appenda entrada no <code>logbook.md</code> do projeto</div></div>
        <div class="flow-step"><div class="flow-num">D</div><div class="flow-body">Termina com <code>RESULTADO: &lt;resumo&gt;</code> → parseado e salvo no logbook do agente</div></div>
      </div>
      <div class="highlight-bar" style="margin-top:18px">
        Se precisar de intervenção humana: termina com <strong>ACTION_REQUIRED: &lt;o que precisa&gt;</strong>.
        O executor escreve em <code>5_Inbox/</code> e notifica via Matrix.
        Humano pode retomar com <code>claude --resume &lt;session_id&gt;</code>.
      </div>
    </section>

    <!-- ⑧ MÓDULOS -->
    <section>
      <h2>Módulos do Projeto</h2>
      <table class="mod-table">
        <tr><th>Módulo</th><th>Responsabilidade</th></tr>
        <tr><td>src/vault/</td><td>Leitura do vault — projetos, tasks, agentes, logbooks, backlinks</td></tr>
        <tr><td>src/pm/</td><td>Executor, scheduler, policies, event-bus, health, budget, matrix, active runs</td></tr>
        <tr><td>src/server/</td><td>HTTP server (dashboard, flow, slides, SSE, API) — porta 2948</td></tr>
        <tr><td>src/morning/</td><td>Brief matinal com prioridades e logbooks</td></tr>
        <tr><td>src/inbox/</td><td>Processa <code>00_Inbox</code> com Claude Code</td></tr>
        <tr><td>src/assets/</td><td>Ponteiros <code>.asset</code> + upload copyparty/gdrive</td></tr>
        <tr><td>src/migrate/</td><td>Promoção de projetos do archive via Claude Code</td></tr>
        <tr><td>src/clockify/</td><td>Sincronização de deep work com Clockify</td></tr>
        <tr><td>src/usp/</td><td>Health board das matérias USP</td></tr>
        <tr><td>src/mcp/</td><td>MCP server expondo o vault para Claude Desktop</td></tr>
      </table>
    </section>

    <!-- ⑨ OBSERVABILIDADE -->
    <section>
      <h2>Observabilidade</h2>
      <div class="stack">
        <div class="stack-row"><span class="stack-label" style="color:var(--amber); font-weight:700">executor.ts</span><span class="stack-arrow">→</span><span class="stack-detail">emite JSON lines para stdout</span></div>
        <div class="stack-row"><span class="stack-label">systemd journal</span><span class="stack-arrow">→</span><span class="stack-detail">captura stdout do serviço</span></div>
        <div class="stack-row"><span class="stack-label">promtail</span><span class="stack-arrow">→</span><span class="stack-detail">ingere do journal</span></div>
        <div class="stack-row"><span class="stack-label">Loki</span><span class="stack-arrow">→</span><span class="stack-detail">armazena e indexa logs</span></div>
        <div class="stack-row"><span class="stack-label" style="color:#86efac; font-weight:700">Grafana :3000</span><span class="stack-arrow">→</span><span class="stack-detail">dashboards de custo e saúde</span></div>
      </div>
      <div style="margin-top:20px; font-size:0.6em; color:#a8a29e; margin-bottom:8px">Exemplo — evento <strong style="color:var(--amber)">agent_run</strong></div>
      <div class="event-box">
        {<span class="key">"event"</span>:<span class="str">"agent_run"</span>, <span class="key">"project"</span>:<span class="str">"PSI3451"</span>, <span class="key">"agent"</span>:<span class="str">"@study-assistant"</span>,<br>
        &nbsp;<span class="key">"status"</span>:<span class="str">"success"</span>, <span class="key">"duration_s"</span>:<span class="val">42.3</span>, <span class="key">"cost_usd"</span>:<span class="val">0.0031</span>,<br>
        &nbsp;<span class="key">"tokens_in"</span>:<span class="val">12000</span>, <span class="key">"tokens_out"</span>:<span class="val">800</span>, <span class="key">"cache_hit_pct"</span>:<span class="val">75.0</span>}
      </div>
      <div style="margin-top:10px; font-size:0.58em; color:#78716c">
        Futuro: trocar <code>StdoutBus</code> por <code>KafkaBus</code> em <code>src/pm/event-bus.ts</code> via <code>setEventBus()</code> — placeholder já existe.
      </div>
    </section>

    <!-- ⑩ HTTP SERVER -->
    <section>
      <h2>HTTP Server <span class="tag">porta 2948</span></h2>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:16px">
        <div>
          <div style="font-size:0.6em; color:var(--amber); font-weight:700; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.06em">Endpoints HTML</div>
          <table class="mod-table" style="font-size:0.55em">
            <tr><td>GET /dashboard</td><td>Cards de saúde por projeto</td></tr>
            <tr><td>GET /flow</td><td>Máquina de estados + deps</td></tr>
            <tr><td>GET /slides</td><td>Esta apresentação</td></tr>
          </table>
          <div style="font-size:0.6em; color:var(--amber); font-weight:700; margin:14px 0 8px; text-transform:uppercase; letter-spacing:0.06em">Endpoints JSON</div>
          <table class="mod-table" style="font-size:0.55em">
            <tr><td>GET /api/state</td><td>Projetos + health + custos</td></tr>
            <tr><td>GET /api/active</td><td>Runs em andamento</td></tr>
            <tr><td>GET /api/costs</td><td>Custos do dia</td></tr>
            <tr><td>GET /agents</td><td>Lista de agentes</td></tr>
            <tr><td>GET /inbox</td><td>Itens action-required</td></tr>
            <tr><td>GET /backlinks</td><td>Backlinks de uma nota</td></tr>
          </table>
        </div>
        <div>
          <div style="font-size:0.6em; color:var(--amber); font-weight:700; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.06em">Ações</div>
          <table class="mod-table" style="font-size:0.55em">
            <tr><td>POST /api/run</td><td>Lança taverna execute</td></tr>
            <tr><td>POST /api/drain</td><td>Lança execute --drain</td></tr>
            <tr><td>POST /api/run/:id</td><td>Run para projeto específico</td></tr>
          </table>
          <div style="font-size:0.6em; color:var(--amber); font-weight:700; margin:14px 0 8px; text-transform:uppercase; letter-spacing:0.06em">SSE stream</div>
          <table class="mod-table" style="font-size:0.55em">
            <tr><td>GET /events</td><td><code>connected</code>, <code>update</code>, <code>agent_active</code></td></tr>
          </table>
          <div class="highlight-bar" style="margin-top:14px; font-size:0.85em">
            Cache com TTL + invalidação via SSE quando o vault ou <code>/tmp/taverna-active/</code> mudam.
          </div>
        </div>
      </div>
    </section>

    <!-- ⑪ COMANDOS -->
    <section>
      <h2>CLI — Comandos Principais</h2>
      <div class="cmd-grid">
        <div class="cmd-group">
          <div class="cmd-group-title">Execução</div>
          <code>taverna run --project &lt;id&gt;</code>
          <code>taverna execute</code>
          <code>taverna execute --drain</code>
          <code>taverna run --pipeline</code>
          <code>taverna schedule <span class="cmd-note"># daemon</span></code>
        </div>
        <div class="cmd-group">
          <div class="cmd-group-title">Inspeção</div>
          <code>taverna policy [id]</code>
          <code>taverna snapshot</code>
          <code>taverna status --project &lt;id&gt;</code>
          <code>taverna insights</code>
          <code>taverna plan</code>
        </div>
        <div class="cmd-group">
          <div class="cmd-group-title">Conteúdo</div>
          <code>taverna morning</code>
          <code>taverna report</code>
          <code>taverna inbox</code>
          <code>taverna migrate &lt;path&gt;</code>
          <code>taverna archive-task &lt;p&gt; &lt;t&gt;</code>
        </div>
        <div class="cmd-group">
          <div class="cmd-group-title">Integrações</div>
          <code>taverna clockify sync</code>
          <code>taverna usp-board</code>
          <code>taverna assets store &lt;p&gt;</code>
          <code>taverna backlinks &lt;note&gt;</code>
          <code>taverna serve <span class="cmd-note"># HTTP :2948</span></code>
        </div>
      </div>
    </section>

    <!-- ⑫ INVARIANTES -->
    <section>
      <h2>Invariantes do Sistema</h2>
      <div style="margin-top:16px">
        <div class="highlight-bar" style="margin-bottom:10px"><strong>Vault é a fonte de verdade.</strong> Nenhum estado em memória ou banco — tudo lido do filesystem a cada execução.</div>
        <div class="highlight-bar" style="margin-bottom:10px"><strong>Nunca atualizar <code>_last_run</code> em falha.</strong> Falhas retentam no próximo ciclo. Só avança em sucesso.</div>
        <div class="highlight-bar" style="margin-bottom:10px"><strong>Tasks com dependências não rodam</strong> enquanto deps insatisfeitas. Retorna <code>BLOCKED</code> sem spawnar.</div>
        <div class="highlight-bar" style="margin-bottom:10px"><strong>Budget diário não bloqueia permanentemente</strong> — ledger reseta no dia seguinte.</div>
        <div class="highlight-bar"><strong>bypassPermissions é o padrão</strong> quando o agente não declara <code>permissions:</code> no frontmatter.</div>
      </div>
    </section>

    <!-- ⑬ STACK -->
    <section class="center">
      <h2>Stack Tecnológico</h2>
      <div style="margin-top:28px">
        <span class="pill pill-blue">TypeScript</span>
        <span class="pill pill-blue">Node.js ESM</span>
        <span class="pill pill-amber">commander</span>
        <span class="pill pill-amber">gray-matter</span>
        <span class="pill pill-green">vitest</span>
        <span class="pill pill-green">tsc</span>
        <span class="pill pill-red">Claude CLI</span>
        <span class="pill pill-red">claude --print</span>
        <span class="pill pill-purple">Obsidian Vault</span>
        <span class="pill pill-purple">systemd timers</span>
        <span class="pill pill-green">Loki</span>
        <span class="pill pill-green">Grafana</span>
        <span class="pill pill-amber">Matrix</span>
        <span class="pill pill-blue">tmux</span>
      </div>
      <div style="margin-top:32px; font-size:0.62em; color:#78716c">
        Build: <code>tsc → dist/</code> · Instalado via <code>npm link</code> ou <code>npm install -g</code>
      </div>
    </section>

    <!-- ⑭ FIM -->
    <section class="center" data-background-gradient="radial-gradient(ellipse at 70% 60%, #1c1410 0%, #0c0a09 80%)">
      <p style="font-size:3.5em; margin-bottom:0">🛢️</p>
      <h2 style="font-size:1.8em; margin-top:8px">Taverna</h2>
      <p style="color:#78716c; font-size:0.7em; margin-top:4px">Agentes que trabalham enquanto você dorme.</p>
      <div class="metaphor" style="margin-top:36px; max-width:540px; margin-inline:auto; text-align:left">
        <em>Contratos</em> chegam via vault · <em>Mercenários</em> executam via Claude CLI ·
        O <em>dono</em> orquestra, observa e controla o orçamento.
      </div>
      <p style="margin-top:28px; font-size:0.55em; color:#44403c">~/tools/taverna · TypeScript · Node.js · MIT</p>
    </section>

  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/highlight.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/notes/notes.js"></script>
<script>
  Reveal.initialize({
    hash: true,
    transition: 'slide',
    transitionSpeed: 'fast',
    backgroundTransition: 'fade',
    controls: true,
    progress: true,
    center: false,
    width: 1100,
    height: 700,
    margin: 0.06,
    plugins: [ RevealHighlight, RevealNotes ]
  });
</script>
</body>
</html>`
}
