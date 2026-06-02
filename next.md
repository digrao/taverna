# Taverna — Next

## Concluído

- `src/commands/` — single source of truth; CLI/HTTP/MCP são thin wrappers
- `src/pm/` — quatro camadas explícitas: `observability/`, `scheduling/`, `prompt/`, `engine/`
- `scheduling/plugins.ts` — interfaces `ScoringPlugin`, `TriagePlugin`, `PermissionPlugin`, `SchedulingPlugins`

---

## 1. Wire SchedulingPlugins

As interfaces existem. Falta ligar:

**`scheduling/session-planner.ts`**
`planSession(project, maxTasks, triagePlugin?)` — usa `triagePlugin.triage()` se fornecido, senão default.

**`engine/executor.ts`**
`ExecutorOptions` ganha `schedulingPlugins?: SchedulingPlugins`.
`runAgent()` usa `schedulingPlugins.permissions?.resolve(agent, project)` no lugar de `resolvePolicy()` direto.

**`engine/execute.ts`**
`drainProject()` repassa `schedulingPlugins` para `runAgent()`.

**`engine/scheduler.ts`**
`runScheduler()` ganha parâmetro opcional `SchedulingPlugins`.
Usa `schedulingPlugins.scoring?.rank(...)` no lugar de `rankProjects()` direto.
Repassa para `drainProject()`.

**`plugin/types.ts`**
`TavernaPlugin` ganha `scheduling?: SchedulingPlugins`.

**`commands/work.ts`**
Coleta `scheduling` dos plugins carregados e passa para `runScheduler()`.

Resultado: qualquer plugin pode substituir scoring, triage ou permissões sem tocar no core.

---

## 2. Human-assignable tasks

**`vault/types.ts` — `VaultTask`**
Adicionar `assignee?: string`.
Valores: `'human'` ou `'@agent-name'`. Ausente = segue agente padrão do projeto.

**Frontmatter de task:**
```yaml
assignee: human
```

**`scheduling/session-planner.ts`**
Tasks com `assignee === 'human'` vão para `awaitingHuman` (campo já existe).

**`commands/inbox.ts`**
Além de `00_Inbox/` (action-required), listar tasks com `assignee: human` de todos os projetos.
Separar em dois grupos: *pendências para você* e *items do agente esperando input*.

Resultado: humanos e agentes compartilham o mesmo backlog de tasks; o sistema roteia corretamente para cada um.

---

## 3. 10_Projects como git submodules

**`vault/project.ts`**
Detectar se `10_Projects/<id>/.git` é arquivo (submodule) vs diretório (repo local).
`VaultProject` ganha `isSubmodule: boolean` e `submoduleRemote?: string`.

**Novo comando: `taverna sync`**
Para cada projeto com `isSubmodule: true`:
```
git submodule update --remote --merge -- 10_Projects/<id>
```
Mostra: ok / dirty / ahead / behind por projeto.

**`taverna status --project <id>`**
Se `isSubmodule`, mostra estado do submodule (hash atual, remoto, dirty).

**Convenção open source:**
Um projeto comunitário é qualquer repo público com `README.md` no formato taverna.
Para adotar: `git submodule add <url> 10_Projects/<id>`.
Frontmatter mínimo documentado em CONTRIBUTING.md.

---

## 4. Open source foundation

- `CONTRIBUTING.md` — setup, estrutura de projeto, convenção de frontmatter, guia de plugin
- `.github/ISSUE_TEMPLATE/` — bug report + feature request
- `.github/PULL_REQUEST_TEMPLATE.md` — checklist CI
- README section "Writing a plugin" com exemplo completo
- `taverna create-plugin` scaffold melhorado: gera `onLoad`, `scheduling`, `httpRoute` de exemplo

---

## Ordem

```
1 → Wire SchedulingPlugins     (completa o que já está definido)
2 → Human tasks                (pequeno, alto valor para workflows mistos)
3 → Submodule support          (permite colaboração open source)
4 → Open source foundation     (pode correr em paralelo com 3)
```
