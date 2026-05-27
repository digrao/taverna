export function renderIshine(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ishine — Onboarding</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/night.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/monokai.css" />
  <style>
    :root {
      --indigo: #818cf8;
      --indigo-dim: #1e1b4b;
      --indigo-mid: #4f46e5;
      --violet: #a78bfa;
      --rose: #fb7185;
      --text: #e2e8f0;
      --muted: #64748b;
      --card-bg: rgba(129,140,248,.07);
      --card-border: rgba(129,140,248,.22);
    }

    .reveal { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
    .reveal h1, .reveal h2 { color: var(--indigo); text-transform: none; letter-spacing: -0.02em; }
    .reveal h1 { font-size: 2.2em; }
    .reveal h2 { font-size: 1.45em; }
    .reveal section { text-align: left; }
    .reveal .slides section.center { text-align: center; }
    .reveal code { color: #a5b4fc; }
    .reveal pre { border-radius: 6px; }

    .back-link {
      position: fixed; top: 14px; left: 14px; z-index: 100;
      font-size: 0.78em; color: var(--muted); text-decoration: none;
      background: rgba(15,10,40,.85); border: 1px solid #1e1b4b;
      padding: 4px 12px; transition: color .15s, border-color .15s;
    }
    .back-link:hover { color: var(--indigo); border-color: var(--indigo-mid); }

    .tag {
      display: inline-block; background: var(--indigo-dim); color: var(--indigo);
      border: 1px solid var(--indigo-mid); border-radius: 4px;
      padding: 2px 9px; font-size: 0.52em; font-weight: 600;
      vertical-align: middle; margin-left: 8px; letter-spacing: 0.05em;
    }

    .step-label {
      display: inline-block; font-size: 0.55em; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--indigo); border-bottom: 1px solid var(--indigo-mid);
      padding-bottom: 3px; margin-bottom: 14px;
    }

    .hbox {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 6px; padding: 11px 16px;
      font-size: 0.62em; color: var(--text); margin-top: 10px; line-height: 1.65;
    }
    .hbox strong { color: var(--indigo); }
    .hbox code { color: #a5b4fc; font-size: 0.92em; }

    .vision {
      background: linear-gradient(135deg, rgba(129,140,248,.1), rgba(167,139,250,.05));
      border-left: 3px solid var(--indigo); border-radius: 0 8px 8px 0;
      padding: 18px 22px; margin: 18px 0; font-size: 0.7em;
      color: var(--text); line-height: 1.8;
    }
    .vision em { color: var(--indigo); font-style: normal; font-weight: 600; }
    .vision strong { color: var(--violet); }

    .flow { display: flex; flex-direction: column; gap: 9px; margin-top: 14px; }
    .flow-step { display: flex; align-items: flex-start; gap: 13px; }
    .flow-num {
      background: var(--indigo); color: #0f0a2e; border-radius: 50%;
      width: 27px; height: 27px; display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 0.62em; flex-shrink: 0; margin-top: 2px;
    }
    .flow-body { font-size: 0.64em; color: var(--text); line-height: 1.55; }
    .flow-body strong { color: var(--indigo); }
    .flow-body code { background: #0f0a2e; color: #a5b4fc; padding: 1px 5px; border-radius: 3px; font-size: 0.92em; }
    .flow-body .note { color: var(--muted); font-size: 0.9em; }

    .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 14px; }
    .cols3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-top: 14px; }

    .card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 8px; padding: 16px;
    }
    .card-title { color: var(--indigo); font-weight: 700; font-size: 0.75em; margin-bottom: 9px; }
    .card p, .card li { font-size: 0.58em; color: var(--text); margin: 4px 0; line-height: 1.55; }
    .card ul { margin: 0; padding-left: 15px; }
    .card code { color: #a5b4fc; font-size: 0.9em; }

    .tool-card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 8px; padding: 18px 16px; text-align: center;
    }
    .tool-icon { font-size: 2.2em; display: block; margin-bottom: 8px; }
    .tool-name { color: var(--indigo); font-weight: 700; font-size: 0.75em; display: block; margin-bottom: 6px; }
    .tool-desc { font-size: 0.57em; color: #94a3b8; line-height: 1.55; }

    .arch {
      font-family: monospace; font-size: 0.56em; color: var(--muted);
      line-height: 1.8; background: #070512; border: 1px solid #1e1b4b;
      border-radius: 8px; padding: 16px 20px; margin-top: 14px;
    }
    .arch .hl  { color: var(--indigo); font-weight: 700; }
    .arch .grn { color: #86efac; }
    .arch .yel { color: #fde68a; }
    .arch .pnk { color: var(--rose); }
    .arch .vio { color: var(--violet); }
    .arch .dim { color: #1e1b4b; }

    .fm {
      font-family: monospace; font-size: 0.52em; background: #070512;
      border: 1px solid #1e1b4b; border-radius: 8px; padding: 14px 18px;
      margin-top: 10px; line-height: 1.8;
    }
    .fm .key { color: #93c5fd; }
    .fm .val { color: #a5b4fc; }
    .fm .str { color: #86efac; }
    .fm .com { color: #334155; }
    .fm .sep { color: #4c1d95; }

    .pill { display: inline-block; border-radius: 999px; padding: 2px 11px; font-size: 0.53em; font-weight: 600; margin: 3px; }
    .pill-indigo  { background: var(--indigo-dim); color: var(--indigo); }
    .pill-violet  { background: #2e1065; color: var(--violet); }
    .pill-green   { background: #14532d; color: #86efac; }
    .pill-rose    { background: #4c0519; color: var(--rose); }
    .pill-sky     { background: #0c4a6e; color: #7dd3fc; }

    .role-row {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 10px 14px; border-bottom: 1px solid #1e1b4b;
      font-size: 0.62em;
    }
    .role-row:last-child { border-bottom: none; }
    .role-icon { font-size: 1.5em; flex-shrink: 0; }
    .role-name { color: var(--indigo); font-weight: 700; min-width: 160px; }
    .role-desc { color: #94a3b8; line-height: 1.5; }

    .step-box {
      background: #070512; border: 1px solid #1e1b4b; border-radius: 8px; overflow: hidden; margin-top: 12px;
    }
    .step-row {
      display: flex; align-items: flex-start; gap: 16px; padding: 12px 16px;
      border-bottom: 1px solid #1e1b4b; font-size: 0.62em;
    }
    .step-row:last-child { border-bottom: none; }
    .step-icon { font-size: 1.4em; flex-shrink: 0; margin-top: 1px; }
    .step-title { color: var(--indigo); font-weight: 600; margin-bottom: 3px; }
    .step-body { color: #94a3b8; line-height: 1.5; }
    .step-body code { color: #a5b4fc; background: #0f0a2e; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }

    .do-dont {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 14px;
    }
    .do-box { background: rgba(134,239,172,.06); border: 1px solid rgba(134,239,172,.2); border-radius: 8px; padding: 14px 16px; }
    .dont-box { background: rgba(251,113,133,.06); border: 1px solid rgba(251,113,133,.2); border-radius: 8px; padding: 14px 16px; }
    .do-title { color: #86efac; font-weight: 700; font-size: 0.65em; margin-bottom: 8px; }
    .dont-title { color: var(--rose); font-weight: 700; font-size: 0.65em; margin-bottom: 8px; }
    .do-box li, .dont-box li { font-size: 0.58em; color: var(--text); margin: 4px 0; line-height: 1.5; }
    .do-box ul, .dont-box ul { margin: 0; padding-left: 15px; }

    .title-logo { font-size: 4.5em; margin-bottom: 0; line-height: 1; }
    .title-sub  { color: var(--muted); font-size: 0.85em; margin-top: 4px; }
  </style>
</head>
<body>

<a class="back-link" href="/dashboard">← taverna</a>

<div class="reveal">
  <div class="slides">

    <!-- ① TÍTULO -->
    <section class="center" data-background-gradient="radial-gradient(ellipse at 40% 40%, #0d0a2e 0%, #050310 80%)">
      <p class="title-logo">✨</p>
      <h1 style="font-size:3em; margin:0; color:var(--indigo)">ishine</h1>
      <p class="title-sub">Gestão de projetos com agentes de IA · Onboarding do time</p>
      <div class="vision" style="margin-top:32px; max-width:640px; margin-inline:auto; text-align:left">
        Um grupo de amigos com um objetivo comum: usar <em>agentes de IA</em> para executar
        projetos reais de forma <strong>assíncrona, organizada e colaborativa</strong>.
        Cada membro traz demandas. Os agentes executam. O vault registra tudo.
      </div>
    </section>

    <!-- ② O QUE É O ISHINE -->
    <section>
      <h2>O que é o ishine?</h2>
      <div class="vision" style="margin-top:10px">
        Uma <em>startup operada por agentes</em> — os membros do time definem projetos e tarefas
        em texto, e agentes Claude executam o trabalho técnico de forma autônoma.
        A coordenação acontece via <strong>Obsidian</strong> (projetos e tasks) e
        <strong>Matrix</strong> (comunicação e notificações).
      </div>
      <div class="cols3" style="margin-top:16px">
        <div class="card">
          <div class="card-title">📋 Projetos compartilhados</div>
          <p>Cada iniciativa vive como uma pasta no vault. Qualquer membro pode criar, acompanhar e priorizar tasks.</p>
        </div>
        <div class="card">
          <div class="card-title">🤖 Agentes especializados</div>
          <p>Cada agente tem uma diretiva clara — dev, pesquisa, planejamento. O executor distribui o trabalho automaticamente.</p>
        </div>
        <div class="card">
          <div class="card-title">🔔 Visibilidade total</div>
          <p>Notificações no Matrix, dashboard web, logbooks de execução. Nada cai em buraco negro.</p>
        </div>
      </div>
    </section>

    <!-- ③ O STACK DE FERRAMENTAS -->
    <section>
      <h2>As ferramentas do time</h2>
      <div class="cols3" style="margin-top:18px">
        <div class="tool-card">
          <span class="tool-icon">🗃️</span>
          <span class="tool-name">Obsidian</span>
          <span class="tool-desc">Onde vivem projetos, tasks e notas. A fonte de verdade do time. Cada arquivo markdown é um objeto com metadados estruturados.</span>
        </div>
        <div class="tool-card">
          <span class="tool-icon">💬</span>
          <span class="tool-name">Matrix</span>
          <span class="tool-desc">Comunicação do time e notificações dos agentes. Quando um agente conclui ou precisa de você, a mensagem chega aqui.</span>
        </div>
        <div class="tool-card">
          <span class="tool-icon">🛢️</span>
          <span class="tool-name">Taverna</span>
          <span class="tool-desc">O motor que lê o vault e executa os agentes. Roda em background, observável via dashboard web em <code>:2948</code>.</span>
        </div>
      </div>
      <div class="cols2" style="margin-top:14px">
        <div class="tool-card" style="text-align:center">
          <span class="tool-icon">🤖</span>
          <span class="tool-name">Claude (Agentes)</span>
          <span class="tool-desc">Cada agente é uma instância do Claude com uma diretiva especializada. Recebe tasks, executa, reporta resultado.</span>
        </div>
        <div class="tool-card" style="text-align:center">
          <span class="tool-icon">📊</span>
          <span class="tool-name">Grafana + Loki</span>
          <span class="tool-desc">Observabilidade de todas as execuções — custos, duração, tokens, saúde dos projetos. Dashboard em <a href="http://start:3000" target="_blank" style="color:var(--indigo)">start:3000</a>.</span>
        </div>
      </div>
    </section>

    <!-- ④ OBSIDIAN: ESTRUTURA DO VAULT -->
    <section>
      <h2>Obsidian — Estrutura do Vault</h2>
      <div class="cols2">
        <div>
          <div class="step-label">Como está organizado</div>
          <div class="arch">
            <span class="hl">10_Projects/</span>  <span class="dim">← projetos ativos</span><br>
            &nbsp;&nbsp;<span class="vio">meu-projeto/</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;<span class="grn">meu-projeto.md</span>  <span class="dim">← info + config</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;<span class="yel">tasks/</span>           <span class="dim">← tarefas</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="grn">01-pesquisa.md</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="grn">02-prototipo.md</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="dim">archive/</span>     <span class="dim">← concluídas</span><br>
            &nbsp;&nbsp;&nbsp;&nbsp;<span class="pnk">logbook.md</span>       <span class="dim">← histórico</span><br>
            <br>
            <span class="hl">60_Agents/</span>  <span class="dim">← agentes disponíveis</span><br>
            &nbsp;&nbsp;<span class="vio">@dev-agent/</span><br>
            &nbsp;&nbsp;<span class="vio">@planner/</span><br>
            &nbsp;&nbsp;<span class="vio">@researcher/</span>
          </div>
        </div>
        <div>
          <div class="step-label">Frontmatter de um projeto</div>
          <div class="fm">
            <span class="sep">---</span><br>
            <span class="key">id:</span> <span class="str">meu-projeto</span><br>
            <span class="key">tipo:</span> <span class="str">BB</span>  <span class="com"># startup/side project</span><br>
            <span class="key">priority:</span> <span class="str">high</span><br>
            <span class="key">agent:</span> <span class="str">'@dev-agent'</span><br>
            <span class="key">run_every:</span> <span class="str">daily</span><br>
            <span class="key">budget_usd_daily:</span> <span class="val">1.00</span><br>
            <span class="key">target:</span> <span class="str">'jvcm@start:path/projeto'</span><br>
            <span class="com"># preenchido automaticamente:</span><br>
            <span class="key">_last_run:</span> <span class="str">2026-05-23T…</span><br>
            <span class="key">_last_status:</span> <span class="str">success</span><br>
            <span class="sep">---</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ⑤ OBSIDIAN: CRIAR UMA TASK -->
    <section>
      <h2>Obsidian — Como criar uma task</h2>
      <div style="font-size:0.65em; color:#94a3b8; margin-bottom:6px">Cada task é um arquivo <code>.md</code> dentro de <code>tasks/</code> com frontmatter estruturado:</div>
      <div class="cols2">
        <div>
          <div class="fm">
            <span class="sep">---</span><br>
            <span class="key">progresso:</span> <span class="val">0</span>       <span class="com"># 0–100</span><br>
            <span class="key">prioridade:</span> <span class="str">high</span><br>
            <span class="key">deadline:</span> <span class="str">2026-06-01</span><br>
            <span class="key">state:</span> <span class="str">backlog</span><br>
            <span class="key">depends:</span>              <span class="com"># opcional</span><br>
            &nbsp;&nbsp;<span class="val">- 01-pesquisa</span><br>
            <span class="sep">---</span><br>
            <br>
            <span class="com"># Título da Task</span><br>
            <br>
            Descrição clara do que precisa ser feito.<br>
            Contexto relevante, referências, critérios<br>
            de aceitação.
          </div>
        </div>
        <div>
          <div class="step-label">Estados de uma task</div>
          <div class="step-box">
            <div class="step-row">
              <span class="step-icon">📥</span>
              <div><div class="step-title">backlog / tarefinha / tarefa</div><div class="step-body">Task criada, aguardando execução</div></div>
            </div>
            <div class="step-row">
              <span class="step-icon">⚡</span>
              <div><div class="step-title">em-progresso</div><div class="step-body">Agente está trabalhando agora</div></div>
            </div>
            <div class="step-row">
              <span class="step-icon">🙋</span>
              <div><div class="step-title">aguardando_humano</div><div class="step-body">Agente pediu algo para você — verifique o Matrix</div></div>
            </div>
            <div class="step-row">
              <span class="step-icon">✅</span>
              <div><div class="step-title">concluida</div><div class="step-body">Move para <code>archive/</code>, logbook atualizado</div></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ⑥ FLUXO DE TRABALHO -->
    <section>
      <h2>Fluxo de trabalho <span class="tag">do zero ao resultado</span></h2>
      <div class="flow">
        <div class="flow-step">
          <div class="flow-num">1</div>
          <div class="flow-body"><strong>Você cria a task</strong> — abre o Obsidian, cria <code>tasks/nova-task.md</code>, preenche frontmatter e escreve o que precisa ser feito</div>
        </div>
        <div class="flow-step">
          <div class="flow-num">2</div>
          <div class="flow-body"><strong>Taverna detecta</strong> — no próximo ciclo (≤ 1 hora), o scheduler vê que o projeto está due e a task está pendente</div>
        </div>
        <div class="flow-step">
          <div class="flow-num">3</div>
          <div class="flow-body"><strong>Agente executa</strong> — recebe sua task + diretiva + contexto do projeto, trabalha de forma autônoma no repositório/arquivos</div>
        </div>
        <div class="flow-step">
          <div class="flow-num">4</div>
          <div class="flow-body"><strong>Resultado chega</strong> — <code>progresso:</code> atualizado, <code>RESULTADO:</code> registrado no logbook, task movida para <code>archive/</code> se 100%</div>
        </div>
        <div class="flow-step">
          <div class="flow-num">5</div>
          <div class="flow-body"><strong>Notificação</strong> — Matrix avisa que o agente concluiu (ou que precisa de você: <code>ACTION_REQUIRED</code>)</div>
        </div>
        <div class="flow-step">
          <div class="flow-num">6</div>
          <div class="flow-body"><strong>Você revisa</strong> — resultado no logbook, código/arquivo no <code>target</code>, pronto para próxima iteração</div>
        </div>
      </div>
    </section>

    <!-- ⑦ MATRIX -->
    <section>
      <h2>Matrix — Comunicação e Notificações</h2>
      <div class="cols2">
        <div>
          <div class="step-label">Para que serve</div>
          <div class="step-box" style="margin-top:8px">
            <div class="step-row">
              <span class="step-icon">✅</span>
              <div><div class="step-title">Conclusão de agente</div><div class="step-body"><code>[taverna] ✓ @dev-agent concluiu meu-projeto</code></div></div>
            </div>
            <div class="step-row">
              <span class="step-icon">⚠️</span>
              <div><div class="step-title">Intervenção necessária</div><div class="step-body"><code>[taverna] ⚠ @dev-agent aguarda input</code><br>+ instrução de como retomar com <code>claude --resume</code></div></div>
            </div>
            <div class="step-row">
              <span class="step-icon">💬</span>
              <div><div class="step-title">Comunicação do time</div><div class="step-body">Discussão de demandas, revisão de resultados, decisões assíncronas</div></div>
            </div>
          </div>
        </div>
        <div>
          <div class="step-label">Como configurar</div>
          <div class="hbox" style="margin-top:8px">
            <strong>1.</strong> Criar conta em um servidor Matrix (ex: matrix.org)<br><br>
            <strong>2.</strong> Entrar no room do ishine<br><br>
            <strong>3.</strong> Ativar notificações no app<br>
            <span style="color:var(--muted)">Element (desktop/mobile) recomendado</span><br><br>
            <strong>Quando um agente pedir ACTION_REQUIRED:</strong><br>
            — Leia o aviso no Matrix<br>
            — Faça o que foi pedido (ex: aprovar PR, fornecer info)<br>
            — Retome: <code>claude --resume &lt;session_id&gt;</code>
          </div>
        </div>
      </div>
    </section>

    <!-- ⑧ AGENTES DISPONÍVEIS -->
    <section>
      <h2>Agentes disponíveis</h2>
      <div class="step-box" style="margin-top:14px">
        <div class="role-row">
          <span class="role-icon">🔧</span>
          <span class="role-name">@dev-agent</span>
          <span class="role-desc">Escreve código, refatora, cria PRs, resolve bugs. Trabalha em repositórios com acesso a git. Ideal para tasks técnicas bem definidas.</span>
        </div>
        <div class="role-row">
          <span class="role-icon">📅</span>
          <span class="role-name">@planner</span>
          <span class="role-desc">Organiza backlogs, cria roadmaps, quebra épicos em tasks, redige documentos de planejamento. Bom ponto de partida para projetos novos.</span>
        </div>
        <div class="role-row">
          <span class="role-icon">🔍</span>
          <span class="role-name">@researcher</span>
          <span class="role-desc">Pesquisa tecnologias, compara alternativas, produz relatórios. Use para decisões que precisam de benchmark ou análise de mercado.</span>
        </div>
      </div>
      <div class="hbox" style="margin-top:14px">
        <strong>Escolha o agente certo:</strong> declare <code>agent: '@dev-agent'</code> no frontmatter do projeto.
        O executor usa esse agente por padrão para todas as tasks. Tasks individuais podem sobrescrever com <code>agent:</code> no frontmatter da task.
      </div>
    </section>

    <!-- ⑨ BOAS PRÁTICAS DE TASKS -->
    <section>
      <h2>Boas práticas — Escrevendo tasks</h2>
      <div class="do-dont">
        <div class="do-box">
          <div class="do-title">✓ Faça assim</div>
          <ul>
            <li>Descreva o <strong>resultado esperado</strong>, não o processo</li>
            <li>Dê contexto: links, exemplos, restrições</li>
            <li>Uma task = um entregável claro</li>
            <li>Use <code>depends:</code> quando a ordem importa</li>
            <li>Defina <code>deadline:</code> para tasks urgentes</li>
            <li>Escreva em português ou inglês — o agente entende os dois</li>
          </ul>
        </div>
        <div class="dont-box">
          <div class="dont-title">✗ Evite</div>
          <ul>
            <li>Tasks vagas: "melhorar o projeto" sem critério</li>
            <li>Tasks gigantes que deveriam ser épicos</li>
            <li>Pedir ao agente coisas que exigem acesso externo sem configurar</li>
            <li>Ignorar <code>ACTION_REQUIRED</code> — o agente fica bloqueado</li>
            <li>Deixar <code>budget_usd_daily</code> sem limite em projetos longos</li>
          </ul>
        </div>
      </div>
      <div class="hbox" style="margin-top:14px">
        <strong>Dica:</strong> comece com <code>@planner</code> para quebrar uma ideia grande em tasks bem definidas — aí passe para <code>@dev-agent</code> ou <code>@researcher</code>.
      </div>
    </section>

    <!-- ⑩ DASHBOARD & ACOMPANHAMENTO -->
    <section>
      <h2>Acompanhando o progresso</h2>
      <div class="cols2">
        <div>
          <div class="step-label">Dashboard web</div>
          <div class="step-box" style="margin-top:8px">
            <div class="step-row">
              <span class="step-icon">🖥️</span>
              <div>
                <div class="step-title"><a href="http://start:2948/dashboard" target="_blank" style="color:var(--indigo)">start:2948/dashboard</a></div>
                <div class="step-body">Cards de todos os projetos com health, progresso, custo do dia e botão de execução manual</div>
              </div>
            </div>
            <div class="step-row">
              <span class="step-icon">🔄</span>
              <div>
                <div class="step-title"><a href="http://start:2948/flow" target="_blank" style="color:var(--indigo)">start:2948/flow</a></div>
                <div class="step-body">Máquina de estados das tasks + grafo de dependências</div>
              </div>
            </div>
            <div class="step-row">
              <span class="step-icon">📊</span>
              <div>
                <div class="step-title"><a href="http://start:3000" target="_blank" style="color:var(--indigo)">start:3000 — Grafana</a></div>
                <div class="step-body">Histórico de execuções, custos acumulados, cache hit rate</div>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div class="step-label">No Obsidian</div>
          <div class="hbox" style="margin-top:8px">
            <strong>logbook.md</strong> do projeto — registro cronológico de cada execução com resultado e duração.<br><br>
            <strong>tasks/archive/</strong> — tasks concluídas, preservadas com o <code>_session_id</code> original.<br><br>
            <strong>60_Agents/2_Logbooks/</strong> — logbook por agente, com todos os resultados ao longo do tempo.<br><br>
            <strong>60_Agents/5_Inbox/</strong> — notificações <code>ACTION_REQUIRED</code> pendentes.
          </div>
        </div>
      </div>
    </section>

    <!-- ⑪ PRIMEIROS PASSOS -->
    <section>
      <h2>Primeiros passos <span class="tag">checklist</span></h2>
      <div class="flow">
        <div class="flow-step">
          <div class="flow-num">1</div>
          <div class="flow-body"><strong>Instalar Obsidian</strong> e abrir o vault do ishine <span class="note">— peça o link de convite ao João</span></div>
        </div>
        <div class="flow-step">
          <div class="flow-num">2</div>
          <div class="flow-body"><strong>Entrar no Matrix</strong> — criar conta, instalar Element, entrar no room do ishine</div>
        </div>
        <div class="flow-step">
          <div class="flow-num">3</div>
          <div class="flow-body"><strong>Explorar o dashboard</strong> em <a href="http://start:2948/dashboard" target="_blank" style="color:var(--indigo)">start:2948/dashboard</a> — ver projetos ativos, health e últimas execuções</div>
        </div>
        <div class="flow-step">
          <div class="flow-num">4</div>
          <div class="flow-body"><strong>Criar sua primeira task</strong> — escolha um projeto existente, crie <code>tasks/minha-primeira-task.md</code> com frontmatter mínimo</div>
        </div>
        <div class="flow-step">
          <div class="flow-num">5</div>
          <div class="flow-body"><strong>Acompanhar a execução</strong> — aguarde a notificação no Matrix ou verifique o logbook no Obsidian</div>
        </div>
        <div class="flow-step">
          <div class="flow-num">6</div>
          <div class="flow-body"><strong>Revisar e iterar</strong> — leia o <code>RESULTADO:</code> no logbook, ajuste a task se necessário, crie a próxima</div>
        </div>
      </div>
    </section>

    <!-- ⑫ DÚVIDAS COMUNS -->
    <section>
      <h2>Dúvidas frequentes</h2>
      <div class="step-box" style="margin-top:14px">
        <div class="step-row">
          <span class="step-icon">❓</span>
          <div>
            <div class="step-title">O agente não executou minha task — por quê?</div>
            <div class="step-body">Verifique: <code>run_every</code> do projeto (pode estar aguardando o próximo ciclo), <code>budget_usd_daily</code> atingido, ou task com <code>depends:</code> não satisfeitas. Use <code>taverna status --project &lt;id&gt;</code> para diagnóstico.</div>
          </div>
        </div>
        <div class="step-row">
          <span class="step-icon">❓</span>
          <div>
            <div class="step-title">Recebi ACTION_REQUIRED no Matrix — o que faço?</div>
            <div class="step-body">Leia o arquivo em <code>60_Agents/5_Inbox/</code>, faça o que foi pedido, e retome com <code>claude --resume &lt;session_id&gt;</code> no terminal. Se não tiver acesso ao terminal, avise o João.</div>
          </div>
        </div>
        <div class="step-row">
          <span class="step-icon">❓</span>
          <div>
            <div class="step-title">Como executo um agente agora, sem esperar o ciclo?</div>
            <div class="step-body">No dashboard, clique em <strong>▶</strong> no card do projeto. Ou no terminal: <code>taverna run --project &lt;id&gt;</code>.</div>
          </div>
        </div>
        <div class="step-row">
          <span class="step-icon">❓</span>
          <div>
            <div class="step-title">Quanto custa uma execução?</div>
            <div class="step-body">Depende do tamanho do contexto. Execuções típicas custam $0.002–0.02. O custo do dia aparece no dashboard e em <code>start:2948/api/costs</code>.</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ⑬ FIM -->
    <section class="center" data-background-gradient="radial-gradient(ellipse at 60% 40%, #0d0a2e 0%, #050310 80%)">
      <p class="title-logo">✨</p>
      <h2 style="font-size:1.8em; margin-top:8px; color:var(--indigo)">Bem-vindo ao ishine</h2>
      <p style="color:var(--muted); font-size:0.7em; margin-top:4px">Projetos que avançam. Agentes que executam. Time que decide.</p>
      <div style="margin-top:36px; display:flex; justify-content:center; gap:12px; flex-wrap:wrap">
        <a href="http://start:2948/dashboard" target="_blank" style="color:var(--indigo);font-size:0.62em;text-decoration:none;border:1px solid var(--indigo-mid);padding:6px 16px;border-radius:4px">🖥️ Dashboard</a>
        <a href="http://start:3000" target="_blank" style="color:#86efac;font-size:0.62em;text-decoration:none;border:1px solid rgba(134,239,172,.3);padding:6px 16px;border-radius:4px">📊 Grafana</a>
        <a href="http://start:3900" target="_blank" style="color:#7dd3fc;font-size:0.62em;text-decoration:none;border:1px solid rgba(125,211,252,.3);padding:6px 16px;border-radius:4px">📦 Copyparty</a>
        <a href="/slides" style="color:var(--muted);font-size:0.62em;text-decoration:none;border:1px solid #1e1b4b;padding:6px 16px;border-radius:4px">🛢️ Como funciona o taverna →</a>
      </div>
      <div style="margin-top:32px; display:flex; justify-content:center; gap:8px; flex-wrap:wrap">
        <span class="pill pill-indigo">Obsidian</span>
        <span class="pill pill-violet">Matrix</span>
        <span class="pill pill-green">Taverna</span>
        <span class="pill pill-sky">Claude</span>
        <span class="pill pill-rose">ishine</span>
      </div>
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
