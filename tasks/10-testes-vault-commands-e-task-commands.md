
# Testes: vault-commands e task-commands

## Situação

Os 46 testes existentes cobrem blocos de construção de baixo nível (bus, template, resolve, canvas, registry, frontmatter). Nenhum teste cobre os handlers de comando que compõem a API real.

## Escopo

Criar `tests/core/vault-commands.test.ts` e `tests/core/task-commands.test.ts` usando uma vault fixture em `tests/fixtures/`.

### vault-commands

- `get_projects`: sem filtro, com `status`, com `tipo`
- `get_project`: projeto existente, projeto inexistente (erro)
- `get_inbox`: inbox com itens, inbox vazia
- `get_backlinks`: wikilink encontrado, sem backlinks

### task-commands

- `get_task_status`: task existente, task inexistente (erro)
- `add_task`: com `title` explícito, com `title` inferido pelo canvas (requer fix da task 9)
- `add_task`: com `body`, com `depende`, verificar evento `core.task.created` no bus
- `archive_task`: mover para `tasks/archive/`, verificar `progresso: 100` no frontmatter, verificar evento `core.task.archived`
- `create_project`: scaffold de pastas esperado

## Vault fixture

Reutilizar ou estender o padrão já adotado em `tests/core/flow/canvas.test.ts` (arquivos temporários por teste). A vault fixture deve ter pelo menos: um projeto com duas tasks (uma com frontmatter completo, uma sem status), uma inbox com um item, e um canvas de fluxo mínimo para os testes de inferência de título.
