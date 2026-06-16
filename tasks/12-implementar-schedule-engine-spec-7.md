
# Implementar: schedule engine (spec 7)

## Referência

Spec completa em `tasks/7-spec-schedule-engine.md`.

## O que implementar

Novo módulo `src/core/schedule/` com:

### `dag.ts`

- Lê `depends` de tasks/projetos como grafo dirigido
- Detecta ciclos (lança erro atômico, nada é computado se o grafo for inválido)
- Ordenação topológica (Kahn)
- CPM (Critical Path Method): calcula `earliestStart`, `latestStart`, `slack` por nó
- Recebe `(item) => number` como resolvedor de peso — não assume nenhum campo de frontmatter

### `index.ts` — dois comandos novos (grupo `schedule`)

```ts
// get_schedule
// params: { projectId }
// retorna: { order, criticalPath, items: { id, earliestStart, latestStart, slack }[] }

// get_schedule_state
// params: { projectId, taskId? }
// retorna: { predecessors, successors, slack, onCriticalPath }
```

Publicar `core.schedule.recomputed` no bus após cada chamada (mesmo que seja leitura pura — o evento serve para dashboards/plugins fazerem cache-bust).

### Resolvedor de peso padrão

O comando core usa um resolvedor que tenta ler `estimate` (número) do `raw` frontmatter da task, com fallback para `1` se ausente. Isso é uma convenção de conveniência do core, documentada como tal — não um contrato fixo.

## Testes

`tests/core/schedule/dag.test.ts`:
- Grafo linear
- Grafo com ramificação (diamante)
- Ciclo detectado → erro
- Grafo vazio
- Caminho crítico correto

## Dependências

Não depende do fix da task 9 nem dos testes das tasks 10-11. Pode ser implementado em paralelo.
