---
id: 2-spec-plugin-interface
title: 'Spec: interface de plugins'
status: "\U0001F3D6️"
project: taverna
progresso: 100
---

Contrato que um plugin deve implementar para estender o taverna.

---

## Descoberta de plugins

Declarados no arquivo de configuração (ver task 3):

```json
{
  "plugins": [
    { "path": "/home/user/tools/taverna-assets/dist/index.js", "enabled": true }
  ]
}
```

Plugins que falham no carregamento são logados e ignorados — nunca derrubam o core.

---

## Namespace

O namespace do plugin é derivado automaticamente do `name`:

```
"taverna-assets"  →  namespace: "assets"
"taverna-gui"     →  namespace: "gui"
```

O plugin pode sobrescrever com `namespace` explícito. O namespace prefixia todas as interfaces:

| Protocolo | Formato |
|---|---|
| HTTP | `GET /api/<namespace>/<command-id>` |
| CLI  | `taverna <namespace> <command-id>` |
| MCP  | `taverna_<namespace>_<command-id>` |

---

## Interface

```ts
interface TavernaPlugin {
  name:       string        // convenção: "taverna-<namespace>"
  namespace?: string        // sobrescreve o namespace derivado do name

  commands?:    PluginCommand[]  // handlers registrados no core
  httpRoutes?:  HttpRoute[]      // rotas brutas (HTML, assets, SSE — sem namespace automático)

  onLoad?: (ctx: PluginContext) => void
}
```

### `PluginCommand`

```ts
interface PluginCommand {
  id:          string
  description: string
  params?:     JsonSchema   // JSON Schema — não Zod diretamente
  expose?:     ('http' | 'mcp' | 'cli')[]  // default: todos os protocolos; [] para não expor
  handler:     (params: Record<string, unknown>, ctx: TavernaContext) => Promise<unknown>
}
```

- Se `expose` for omitido, o comando é publicado em todos os protocolos. Para não expor, declare `expose: []` explicitamente.
- O path HTTP, o subcomando CLI e o nome MCP são gerados pelo adaptador a partir do namespace + id — o plugin não define rotas manualmente.

### `HttpRoute`

Para conteúdo que não é JSON — dashboards, slides, assets. Path é livre (sem namespace forçado).

```ts
interface HttpRoute {
  method:  'GET' | 'POST'
  path:    string
  handler: (req, res, path: string) => Promise<void>
}
```

### `PluginContext`

```ts
interface PluginContext {
  config:          TavernaConfig
  notificationBus: NotificationBus
}
```

---

## Exemplo

```ts
export default {
  name: 'taverna-assets',
  commands: [
    {
      id: 'list',
      description: 'Lista assets de um projeto',
      params: { projectId: { type: 'string' } },
      handler: async ({ projectId }, ctx) => listAssets(projectId, ctx),
      // expose omitido → publicado em http, mcp e cli
    },
    {
      id: 'sync',
      description: 'Sincroniza assets (interno)',
      expose: [],
      handler: async (_, ctx) => syncAssets(ctx),
    },
  ],
} satisfies TavernaPlugin

// Resultado:
//   GET  /api/assets/list
//   MCP  taverna_assets_list
//   CLI  taverna assets list
```

---

## O que NÃO é responsabilidade da interface core

- Hooks de execução (`afterRun`, `beforeTick`, scheduling) → `taverna-claude-code`
- Fluxos e nodes do canvas → configuração do usuário
