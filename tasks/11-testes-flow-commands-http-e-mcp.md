
# Testes: flow commands, HTTP e MCP

## Situação

Os comandos de movimentação (`move_task`, `move_project`, `get_flow`, `get_flow_state`) e os adaptadores HTTP e MCP não têm nenhum teste.

## flow commands — `tests/core/flow/commands.test.ts`

- `get_flow`: retorna estados e transições corretos (depende do fix task 9)
- `get_flow_state`: item sem status → next/previous vazios; item com status → adjacência correta
- `move_task`: transição válida atualiza frontmatter + publica `core.task.moved`; transição inválida lança erro; campo `required` não resolvível lança erro
- `move_project`: mesmo contrato que `move_task`

## HTTP — `tests/http/server.test.ts`

Testar o adaptador com `node:http` diretamente (sem biblioteca de teste HTTP extra):

- `GET /api/get_projects` → `{ data: { projects: [...] } }`
- `POST /api/add_task` → `{ data: { taskId, path } }`
- Comando inválido → `{ error, code: 'NOT_FOUND' }` com status 404
- `GET /api/config/schema` → schema com todos os comandos expostos
- `GET /events` → header `Content-Type: text/event-stream`; evento recebido após `bus.publish`

## MCP — `tests/mcp/server.test.ts`

- `ListToolsRequest` → lista ferramentas com `taverna_` prefix e `inputSchema` correto
- `CallToolRequest` com tool válida → `{ content: [{ type: 'text', text: ... }] }`
- `CallToolRequest` com tool inválida → resposta com `isError: true`
