---
id: 2-spec-plugin-interface
title: "Spec: interface de plugins"
status: 🧠
project: taverna
progresso: 50
---

Contrato que um plugin deve implementar para estender o taverna.

## Descoberta de plugins

Plugins são declarados no arquivo de configuração do taverna (ver task 3):

```json
{
  "plugins": [
    { "path": "/home/user/tools/taverna-assets/dist/index.js", "enabled": true },
    { "path": "/home/user/tools/taverna-gui/dist/index.js",    "enabled": true }
  ]
}
```

- `path` — caminho absoluto para o entry point compilado do plugin
- `enabled` — permite desativar sem remover da lista (gerenciável pelo `taverna-gui`)

`TAVERNA_PLUGINS` (lista de caminhos separada por `:`) ainda é suportado como override de ambiente, mas o arquivo de config é a fonte de verdade. Isso permite que plugins como o `taverna-gui` alterem a lista de plugins ativos em runtime sem edição manual.

Cada entry point exporta um objeto default que satisfaz `TavernaPlugin`.
Plugins que falham no carregamento são logados e ignorados — nunca derrubam o taverna.

---

## Interface

```ts
interface TavernaPlugin {
  name: string          // identificador único, ex: "taverna-assets"

  commands?:    CommandDef[]   // comandos core adicionais (expostos via HTTP e MCP)
  httpRoutes?:  HttpRoute[]    // rotas HTTP brutas para conteúdo não-JSON (HTML, assets)
  cliCommands?: CliDef[]       // subcomandos CLI adicionais

  onLoad?: (ctx: PluginContext) => void  // chamado uma vez ao carregar
}
```

### `CommandDef`

Idêntico ao da task 1 — mesmo contrato do core. Plugins adicionam comandos como se fossem nativos.

```ts
interface CommandDef {
  id:          string
  description: string
  params?:     Schema        // subconjunto de Zod ou JSON Schema
  http?:       { method: 'GET' | 'POST', path: string }
  handler:     (params, ctx: TavernaContext) => Promise<unknown>
}
```

### `HttpRoute`

Para conteúdo que não é JSON — dashboards, slides, assets estáticos.

```ts
interface HttpRoute {
  method:  'GET' | 'POST'
  path:    string            // exato ou prefixo terminando em * (ex: '/slides/*')
  handler: (req, res, path) => Promise<void>
}
```

### `CliDef`

Subcomando CLI registrado no `program` raiz do taverna.

```ts
interface CliDef {
  register: (program: Command, ctx: TavernaContext) => void
}
```

### `PluginContext`

Contexto disponível no `onLoad` — acesso ao bus de notificações e config.

```ts
interface PluginContext {
  config:          TavernaConfig
  notificationBus: NotificationBus
}
```

---

## O que NÃO é responsabilidade do plugin core

- Hooks de execução (`afterRun`, `beforeTick`) → `taverna-claude-code`
- Override de scheduling e scoring → `taverna-claude-code`
- Fluxos e nodes do canvas → configuração do usuário, não plugin

---

## Exemplo mínimo

```ts
export default {
  name: 'taverna-ping',
  commands: [{
    id: 'ping',
    description: 'Health check',
    http: { method: 'GET', path: '/api/ping' },
    handler: async () => ({ ok: true }),
  }],
} satisfies TavernaPlugin
```
