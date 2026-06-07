---
id: 3-spec-config
title: "Spec: configuração"
status: 🧠
project: taverna
progresso: 60
---

SST: o arquivo de configuração é a única fonte de verdade. Sem env vars de config — apenas `--vault` como bootstrap mínimo para localizar o arquivo.

---

## Bootstrap

O único valor externo ao config é o caminho da vault, passado via:
1. `--vault <path>` na CLI
2. `VAULT_PATH` como fallback de ambiente (apenas para vault path)

Localizado o vault, o taverna lê `{vaultPath}/taverna.config.json`. Tudo mais vem dali.

---

## Schema do core

```jsonc
{
  // Diretório dos projetos, relativo ao vaultPath
  "projectsDir": "10_Projects",

  // Diretório dos canvas de fluxo e seus nodes
  "flowDir": "20_Areas/2_Fluxos",

  // Porta do servidor HTTP (taverna serve)
  "port": 2948,

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
  "projectsDir": "10_Projects",
  "flowDir": "20_Areas/2_Fluxos",
  "port": 2948,
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
