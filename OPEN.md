# Taverna — Open Source Checklist

Rastreia o que precisa ser resolvido antes da publicação pública.  
Status: **em andamento**

---

## Blockers

### 1. LICENSE ❌
Nenhum arquivo de licença existe no repo.  
**Decisão:** MIT — permissiva, compatível com a stack (commander, gray-matter, vitest).

### 2. Metadados no package.json ❌
Campos `license`, `author` e `repository` ausentes.  
**Ação:** preencher antes do primeiro release público.

### 3. Dependência privada `@jvcm-infra/neo-matrix` ❌
`src/pm/matrix.ts` importa `NeoMatrixClient` de um pacote privado com registry autenticado.  
Nenhum consumidor externo consegue instalar ou buildar o projeto.

**Decisão:** substituir por chamada direta à Matrix client-server API (um único `fetch` PUT).  
A Matrix homeserver API é pública e estável — não precisamos de um cliente especializado para enviar uma mensagem de texto.

**Futuro:** `@jvcm-infra/neo-matrix` será publicado como plugin `taverna-matrix` separado.  
O plugin implementará a interface `Notifier` e poderá ser carregado via `TAVERNA_NOTIFIER=matrix-plugin` ou `TAVERNA_PLUGINS=taverna-matrix/dist/index.js`.  
Quem não quiser a dependência continua com `TAVERNA_NOTIFIER=console` ou `none`.

### 4. Caminhos pessoais em código ❌

| Arquivo | Linha | Problema | Correção |
|---------|-------|----------|----------|
| `src/pm/policy.ts` | 85 | Default arg `/home/jvcm/tools/policies.yaml` | Usar `process.env['TAVERNA_POLICIES']` com fallback relativo |
| `tests/scaffold.test.ts` | 98, 104 | Path `/home/jvcm/lab2/` em fixture | Substituir por `/tmp/test-workspace/` |
| `package.json` | 20–21 | Scripts `morning`/`morning:dry` com `VAULT_PATH=/home/jvcm/tmp` | Remover fallback hardcoded — exigir env var ou remover scripts de dev |

---

## Warnings (limpar antes de publicar)

### W1. Exemplo de target em CLAUDE.md
`jvcm@start:tools/taverna/` expõe o formato pessoal de target.  
**Ação:** trocar por `user@start:tools/project/` na documentação.

### W2. Comentário pessoal em prompt.ts
Comentário `// Resolves "jvcm@start:some/path"` — algoritmo é genérico, comentário vaza o alias.  
**Ação:** generalizar para `// Resolves "user@start:some/path"`.

### W3. `.npmrc` com registro privado
`.npmrc` referencia o registry privado `@jvcm-infra` com `NODE_AUTH_TOKEN`.  
Após remover `@jvcm-infra/neo-matrix`, o `.npmrc` pode ser simplificado ou removido.

---

## Arquitetura de notificações (pós-abstração)

```
Notifier (interface em src/notifications/types.ts)
  ├─ ConsoleNotifier    — stderr, sempre disponível, padrão em dev
  ├─ MatrixNotifier     — HTTP direto à homeserver (sem deps externas)
  └─ [futuro] plugin taverna-matrix — NeoMatrixClient + features avançadas
```

Configurado via `TAVERNA_NOTIFIER=matrix|console|none`.  
Plugins podem registrar `Notifier` customizados no futuro via `registerNotifier()`.

---

## Ecosystem de plugins (visão)

Taverna core publica a interface `TavernaPlugin` e as subpaths:
- `taverna/vault` — leitura de projetos/tasks/agentes
- `taverna/plugin` — interface de plugin
- `taverna/infra` — FeatureDef + FeatureContext
- `taverna/inbox` — processamento de inbox
- `taverna/config` — loadConfig / TavernaConfig

Plugins first-party que serão publicados separadamente:
| Plugin | Status | Descrição |
|--------|--------|-----------|
| `taverna-briefing` | ✅ em `~/tools/` | inbox + morning brief |
| `taverna-assets` | ⚙️ em `~/tools/` | asset pointers + upload |
| `taverna-edisciplinas` | ⚙️ em `~/tools/` | crawler USP |
| `taverna-matrix` | 📋 planejado | notificações Matrix via neo-matrix |
| `taverna-clockify` | 📋 planejado | sync de deep work hours |

---

## Progresso

- [ ] LICENSE (MIT)
- [ ] package.json: `license`, `author`, `repository`
- [ ] Remover `@jvcm-infra/neo-matrix` — Matrix via HTTP direto
- [ ] Corrigir paths pessoais em `policy.ts` e `scaffold.test.ts`
- [ ] Limpar scripts `morning`/`morning:dry` no package.json
- [ ] Generalizar comentários/exemplos com `jvcm` em docs e código
- [ ] Simplificar `.npmrc`
- [ ] README — expandir para público externo (inglês ou pt-br?)
