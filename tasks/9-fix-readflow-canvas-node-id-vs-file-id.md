
# Fix: readFlow — canvas node ID vs file ID

## Bug

`get_flow` retorna `{ states: [], transitions: [] }` para qualquer canvas. `move_task` e `get_flow_state` ficam quebrados como consequência.

## Causa

`src/core/flow/canvas.ts`, função `readFlow`:

```ts
const schemaPath = join(flowDir, 'nodes', `${node.id}.md`)
```

O `node.id` é o ID interno do Obsidian Canvas (ex: `eeeeddbc8412eff8`). Os arquivos de schema em `nodes/` têm nomes derivados do próprio arquivo markdown que o canvas referencia — ex: o node com `id: "eeeeddbc8412eff8"` tem `file: "20_Areas/2_Fluxos/nodes/eaf83227bbd074f2.md"`. Os dois IDs são sempre diferentes.

## Fix

Para nodes com `type: "file"`, extrair o basename do campo `file` e usar esse nome para localizar o schema:

```ts
// antes
const schemaPath = join(flowDir, 'nodes', `${node.id}.md`)

// depois (para node.type === 'file' && node.file)
import { basename } from 'node:path'
const fileId = basename(node.file, '.md')
const schemaPath = join(flowDir, 'nodes', `${fileId}.md`)
```

A lógica existente de `existsSync` + skip para nodes sem schema permanece igual.

## Testes

Adicionar um caso no `tests/core/flow/canvas.test.ts` com um canvas fixture onde `node.id !== basename(node.file)`, verificando que `readFlow` resolve corretamente os estados e transições.

## Impacto

Desbloqueia `get_flow`, `get_flow_state`, `move_task`, `move_project` no MCP e na CLI com vaults reais.
