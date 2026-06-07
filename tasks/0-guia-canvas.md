# Guia: lendo os arquivos `.canvas` do fluxo

Mini-resumo de como interpretar os canvas em `20_Areas/2_Fluxos/` — útil tanto para entender por que uma task está num determinado estado quanto para implementar `get_flow`/`move_task`/`move_project` (spec 1).

## O que é um `.canvas`

JSON do Obsidian Canvas. Tem dois arrays: `nodes` (caixas no grafo) e `edges` (setas entre elas). Cada `.canvas` na pasta representa **um fluxo** — `task.canvas`, `project.canvas`, `inbox.canvas` — ou seja, a máquina de estados que um tipo de item percorre.

## Nodes: dois tipos relevantes

- **`type: "text"`** — um estado do fluxo. O texto é só um rótulo (geralmente um emoji, ex. `# 🤖`). O `id` do node é o que importa.
- **`type: "file"`** — aponta para uma nota de apoio (ex. `nodes/<id>.md`), não é necessariamente um estado.

> A correspondência entre estado e definição **não é pelo texto/emoji do canvas** — é pelo `id` do node. Cada estado tem um arquivo `nodes/<id>.md` com o mesmo `id`, contendo o schema do pipeline para aquele estado (`required`, `default`, `infer` — ver [[Template Language]] e a spec 1, seção "movimentação").

## Edges: as transições possíveis

Cada edge `{fromNode, toNode}` é uma transição válida entre dois estados. Um node pode ter múltiplas edges de saída (ramificação) e de entrada (mais de um caminho leva até ele).

## Exemplo: `task.canvas`

```
🧩 ──► 🗺️ ──┬──► 🧠 ──► 🏖️
            └──► 🤖 ◄─┘
                 │
                 └──► 🏖️
```

- **🧩** (`required: [project]`, `default: { title: "%n-{{summary}}" }`) — rascunho. Title é gerado, mas falta `summary`.
- **🗺️** (`required: [summary]`) — mapeamento. Pergunta `summary`, que completa o `title` herdado de 🧩.
- **🧠** — ideação/spec, sem campos próprios.
- **🤖** (`required: [agent]`, `infer: { agent: "tipo > project > task" }`) — execução. `agent` é resolvido por escopo antes de perguntar: primeiro olha `tipo`, depois `project`, depois a própria `task`.
- **🏖️** — concluído, sem campos próprios.

Note que 🧠 e 🤖 têm uma edge entre si — uma spec pode voltar a ser pensada depois de começar a ser implementada, e vice-versa.

## Como isso vira `move_task`

1. Ler o `status` atual da frontmatter da task
2. Achar o node com aquele `id` no `.canvas` do fluxo (`flowDir` na config)
3. Olhar as edges de saída → estados possíveis de destino
4. Para o estado de destino, ler `nodes/<id>.md`: aplicar `infer` → `default` → perguntar o que sobrar em `required` e ainda estiver vazio
5. Atualizar `status` na frontmatter da task

Essa é exatamente a lógica abstrata documentada na spec 1 — este guia é só o "como ler o canvas" que sustenta ela.
