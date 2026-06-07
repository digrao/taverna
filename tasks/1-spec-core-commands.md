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

### `get_inbox`
Retorna os itens da inbox da vault.
- params: nenhum
- retorna: `{ items: InboxItem[] }`

### `get_backlinks`
Retorna as referências wikilink para um arquivo.
- params: `file*` (string, caminho relativo à vault)
- retorna: `{ backlinks: { source, line }[] }`

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
Cria uma nova task em um projeto. `title` é inferido pelo pipeline do canvas se omitido.
- params: `projectId*`, `title?`, `body?`, `progresso?` (0–100), `depende?` (string[])
- retorna: `{ taskId, path }`

### `create_project`
Cria a estrutura de pastas de um novo projeto na vault.
- params: `id*`
- retorna: `{ projectPath }`

---

## Grupo: movimentação (canvas-driven)

O taverna lê os `.canvas` de `flowDir` para saber quais transições de estado são válidas. Para cada nó do canvas existe um arquivo em `nodes/{nodeId}.md` (lookup por ID) que define o schema daquele estado. O canvas e seus nodes são configuração do usuário — o taverna apenas interpreta o protocolo.

### Schema de um node (protocolo)

```yaml
status: <identificador do estado>
required:                 # campos que entram no pipeline neste estado
  - <campo>              #   sem valor → taverna pergunta antes de transitar
default:                  # valores gerados automaticamente sem interação
  <campo>: <formato>     #   suporta %n, strftime e {{field|fallback}} — ver [[Template Language]]
infer:                    # campos resolvíveis por escopo, sem perguntar
  <campo>: <escopo1> > <escopo2> > ...
```

Cada campo é declarado uma única vez, no estado em que entra. Estados seguintes herdam. A ordem de resolução para qualquer campo: `infer` → `default` → prompt interativo.

### `get_flow`
Lê um canvas de fluxo e retorna estados, transições e schema de cada nó.
- params: `flow*` (string — nome do canvas sem extensão)
- retorna: `{ states: { id, required: string[], default: Record<string,string>, infer: Record<string,string> }[], transitions: { from, to }[] }`

### `move_task`
Avança ou recua uma task no fluxo, resolvendo campos pelo pipeline antes de transitar.
- params: `projectId*`, `taskId*`, `to*` (identificador do estado destino)
- retorna: `{ previous, current, prompted?: Record<string,string> }`

### `move_project`
Avança (ou recua) um projeto no fluxo de projetos, com a mesma validação de campos obrigatórios.
- params: `projectId*`, `to*` (identificador do estado destino)
- retorna: `{ previous, current, prompted?: Record<string,string> }`

### `get_flow_state`
Retorna o estado atual e os próximos estados possíveis de um item, consultando o canvas.
- params: `projectId*`, `taskId?` (se omitido, consulta o projeto)
- retorna: `{ current, next: string[], previous: string[] }`

---

## O que NÃO é comando core

- `run`, `session_run`, `run_work` — execução de agentes → `taverna-claude-code`
- `get_active`, `get_recent_runs`, `get_costs`, `get_budget` — monitoramento de runs → `taverna-claude-code`
- `get_agents` — diretivas de agentes → `taverna-claude-code`
- `serve` — infraestrutura HTTP (task 4)
- `mcp` — infraestrutura MCP (task 4)
- `create_plugin` — ferramenta de desenvolvimento
- `migrate` — operação pontual, candidato a plugin
