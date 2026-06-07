---
id: 3-spec-config
title: "Spec: configuração"
status: 🧠
project: taverna
progresso: 60
---

SST: o arquivo de configuração é a única fonte de verdade. A vault é conteúdo; o config é infraestrutura — ele não mora dentro da vault, mora junto do próprio taverna (instalação/repositório), versionável independente de qualquer vault específica.

---

## Bootstrap

O config é localizado primeiro — é ele quem informa onde está a vault, nunca o contrário.

Ordem de resolução do caminho do config:
1. `--config <path>` na CLI
2. Caminho fixo padrão (ex.: `~/.config/taverna/config.json`)

Localizado o config, o taverna o lê. Um dos campos do schema do core é `vaultPath` — o caminho absoluto da vault que essa instância do taverna opera. Não há `--vault` nem `VAULT_PATH`: a vault é configuração, não bootstrap.

---

## Schema do core

```jsonc
{
  // Caminho absoluto da vault que esta instância opera
  "vaultPath": "/home/user/notas",

  // Diretório dos projetos, relativo ao vaultPath
  "projectsDir": "10_Projects",

  // Diretório dos canvas de fluxo e seus nodes
  "flowDir": "20_Areas/2_Fluxos",

  // Porta do servidor HTTP (taverna serve)
  "port": 3861,

  // Plugins ativos
  "plugins": [
    {
      // Caminho absoluto para o entry point compilado do plugin
      "path": "/home/user/tools/taverna-assets/dist/index.js",
      "enabled": true
    }
  ]
}
```

Apenas esses campos pertencem ao core. Tudo que era runner-specific no master (`agentDefaults`, `directivesDir`, `logbooksDir`, `policiesPath`, scheduling) vai para `taverna-claude-code`.

---

## Config de plugins

Cada plugin declara seu próprio schema sob seu namespace. O taverna passa `config[plugin.namespace]` ao plugin no `onLoad`.

```jsonc
{
  "vaultPath": "/home/user/notas",
  "projectsDir": "10_Projects",
  "flowDir": "20_Areas/2_Fluxos",
  "port": 3861,
  "plugins": [...],

  // config do plugin taverna-assets (namespace: "assets")
  "assets": {
    "extensions": ["pdf", "pptx", "zip"],
    "copypartyUrl": "http://localhost:3333"
  },

  // config do plugin taverna-claude-code (namespace: "claude-code")
  "claude-code": {
    "agentDefaults": { "*": "@dev-agent" },
    "directivesDir": "60_Agents/1_Directives",
    "logbooksDir":   "60_Agents/2_Logbooks"
  }
}
```

---

## Autodocumentação

O taverna expõe `GET /api/config/schema` retornando o JSON Schema completo do arquivo de config — core + schemas declarados pelos plugins carregados. Isso serve como documentação viva e base para o `taverna-gui` renderizar o formulário de configuração.

---

## O que NÃO é responsabilidade do schema core

- `agentDefaults`, `policiesPath`, scheduling → `taverna-claude-code`
- `assetExtensions`, `copypartyUrl`, `gdriveRemote` → `taverna-assets`
- Qualquer campo de plugin específico → namespace do plugin
