---
id: 1-spec-core-commands
title: "Spec: comandos core"
status: 🧠
project: taverna
progresso: 50
---

Todos os comandos que o core deve implementar, independente de protocolo.
HTTP, MCP e CLI apenas os expõem (ver task 4).

Cada comando tem: `id`, `descrição`, `params`, `retorno`.
Params marcados com `*` são obrigatórios.

---

## Grupo: monitoramento

Consumidos pelo dashboard e Grafana. Todos leitura pura.

### `get_state`
Retorna o estado consolidado da vault: projetos ativos, tarefas pendentes, agentes disponíveis.
- params: nenhum
- retorna: `{ projects: Project[], tasks: Task[], agents: Agent[] }`

### `get_costs`
Retorna o consumo de tokens acumulado por projeto.
- params: nenhum
- retorna: `{ items: { projectId, tokens, estimatedCost }[] }`

### `get_budget`
Retorna o orçamento configurado e quanto já foi consumido.
- params: nenhum
- retorna: `{ limit, used, remaining, unit: 'tokens' | 'usd' }`

### `get_active`
Retorna os agentes em execução no momento.
- params: nenhum
- retorna: `{ runs: { projectId, agentId, startedAt, pid }[] }`

### `get_recent_runs`
Retorna o histórico das últimas execuções.
- params: `limit` (number, default 20)
- retorna: `{ runs: { projectId, agentId, startedAt, durationMs, success, resultado? }[] }`

---

## Grupo: vault

Leitura da vault. Não disparam agentes.

### `get_projects`
Lista todos os projetos da vault com seus metadados do frontmatter.
- params: `status?` (string, filtro), `tipo?` (string, filtro)
- retorna: `{ projects: Project[] }`

### `get_project`
Retorna um projeto específico com suas tasks.
- params: `id*` (string)
- retorna: `{ project: Project, tasks: Task[] }`

### `get_agents`
Lista as diretivas de agentes disponíveis.
- params: nenhum
- retorna: `{ agents: Agent[] }`

### `get_inbox`
Retorna os itens da inbox da vault.
- params: nenhum
- retorna: `{ items: InboxItem[] }`

### `get_backlinks`
Retorna as referências wikilink para um arquivo.
- params: `file*` (string, caminho relativo à vault)
- retorna: `{ backlinks: { source, line }[] }`

### `preview_sessions`
Mostra o que seria despachado se `run_work` fosse chamado agora.
- params: nenhum
- retorna: `{ sessions: { projectId, agentId, tasks: Task[] }[] }`

---

## Grupo: execução

Disparam agentes. Efeitos colaterais.

### `run`
Executa um agente em um projeto. Agente é inferido do frontmatter se omitido.
- params: `projectId*`, `agentId?`, `dryRun?` (bool), `maxChars?` (number), `timeout?` (ms), `drain?` (bool), `maxTasks?` (number)
- retorna: `{ success, durationMs, resultado? }`

### `session_run`
Agrupa múltiplas tasks em uma única sessão de agente (maximiza cache).
- params: `projectId*`, `taskIds?` (string[]), `dryRun?`, `maxChars?`, `timeout?`
- retorna: `{ success, durationMs, resultado? }`

### `run_work`
Despacha agentes em todos os projetos elegíveis e encerra (one-shot, usado pelo systemd).
- params: `dryRun?`, `drain?`, `maxTasks?`
- retorna: `{ dispatched: { projectId, agentId }[], skipped: string[] }`

---

## Grupo: tasks

Operações sobre tasks da vault.

### `get_task_status`
Retorna o status atual de uma task.
- params: `projectId*`, `taskId*`
- retorna: `{ task: Task }`

### `archive_task`
Move uma task concluída para o arquivo.
- params: `projectId*`, `taskId*`
- retorna: `{ archivedTo: string }`

### `add_task`
Cria uma nova task em um projeto.
- params: `projectId*`, `title*`, `body?`, `progresso?` (0–100), `depende?` (string[])
- retorna: `{ taskId, path }`

### `create_project`
Cria a estrutura de pastas de um novo projeto na vault.
- params: `id*`, `agent?`, `tipo?`, `priority?`
- retorna: `{ projectPath }`

---

## Grupo: movimentação (canvas-driven)

O taverna lê os `.canvas` de `flowDir` para saber quais transições de estado são válidas e quais campos o frontmatter deve ter em cada estado. O canvas é a fonte de verdade dos fluxos — não o código.

### `get_flow`
Lê um canvas de fluxo e retorna os estados e transições possíveis.
- params: `flow*` (string, ex: `"task"` ou `"project"`)
- retorna: `{ states: { id, emoji, required: string[] }[], transitions: { from, to }[] }`

### `move_task`
Avança (ou recua) uma task para o próximo estado do fluxo, validando os campos `required` definidos no canvas antes de transitar.
- params: `projectId*`, `taskId*`, `to*` (emoji do estado destino)
- retorna: `{ previous, current, missing?: string[] }` — se `missing` presente, transição negada

### `move_project`
Avança (ou recua) um projeto no fluxo de projetos, com a mesma validação de campos obrigatórios.
- params: `projectId*`, `to*` (emoji do estado destino)
- retorna: `{ previous, current, missing?: string[] }`

### `get_flow_state`
Retorna o estado atual e os próximos estados possíveis de um item, consultando o canvas.
- params: `projectId*`, `taskId?` (se omitido, consulta o projeto)
- retorna: `{ current, next: string[], previous: string[] }`

---

## O que NÃO é comando core

- `serve` — infraestrutura HTTP (task 4)
- `mcp` — infraestrutura MCP (task 4)
- `create_plugin` — ferramenta de desenvolvimento
- `migrate` — operação pontual, candidato a plugin
