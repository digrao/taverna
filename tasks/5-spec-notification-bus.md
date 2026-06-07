---
id: 5-spec-notification-bus
title: 'Spec: bus de notificações'
status: "\U0001F3D6️"
project: taverna
progresso: 100
---

Bus de eventos interno. O core publica eventos tipados; qualquer subscriber (SSE, Matrix, plugin) recebe e entrega no seu transport. Nenhum transport está no core.

---

## Evento

```ts
interface TavernaEvent {
  type:      string    // namespaced: "core.task.moved", "claude-code.run.done"
  payload:   unknown
  timestamp: string    // ISO 8601
}
```

O `type` segue o padrão `<namespace>.<entidade>.<ação>`. Core usa o namespace `core`; plugins usam o namespace do próprio plugin.

---

## Interface do bus

```ts
interface NotificationBus {
  // Publica um evento para todos os subscribers que batem o pattern
  publish(event: TavernaEvent): void

  // Subscreve eventos por pattern (glob: "core.*", "core.task.moved", "*")
  // Retorna função de unsubscribe
  subscribe(pattern: string, handler: (event: TavernaEvent) => void): () => void
}
```

Entrega: `Promise.allSettled` — um subscriber com erro não afeta os outros.

---

## Eventos do core

| Tipo | Payload |
|---|---|
| `core.task.created` | `{ projectId, taskId, path }` |
| `core.task.moved` | `{ projectId, taskId, previous, current }` |
| `core.task.archived` | `{ projectId, taskId, archivedTo }` |
| `core.project.created` | `{ projectId, path }` |
| `core.project.moved` | `{ projectId, previous, current }` |

---

## Subscriber built-in: SSE

Quando `taverna serve` está up, `GET /events` é um subscriber automático — todos os eventos são entregues como SSE para os clientes conectados:

```
data: {"type":"core.task.moved","payload":{...},"timestamp":"2026-06-06T14:30:00Z"}
```

---

## Subscribers de plugins

Plugins registram subscribers no `onLoad`:

```ts
onLoad({ notificationBus }) {
  notificationBus.subscribe('core.*', async (event) => {
    await matrixClient.send(`[${event.type}] ${JSON.stringify(event.payload)}`)
  })
}
```

O core não conhece Matrix, Slack, ou qualquer transport externo.

---

## O que NÃO é responsabilidade do bus core

- Eventos de execução de agentes (`run.started`, `run.done`) → `taverna-claude-code`
- Formatação de mensagens para humanos → responsabilidade do subscriber
- Persistência de eventos → plugin ou subscriber externo
