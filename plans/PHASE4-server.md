# Phase 4 — HTTP Status Server

## Objetivo

Expor o estado do vault via HTTP para visualização em qualquer dispositivo na rede local (celular, outro computador). Baixa latência — responde com o estado atual do vault em < 100ms.

---

## Por que HTTP e não apenas arquivos?

- Pode ser consultado de qualquer dispositivo na rede local sem acesso ao sistema de arquivos
- Permite push de notificações (SSE) quando um agente termina
- Base para um eventual Obsidian plugin nativo que consome a API

---

## Módulos

```
src/
  server/
    index.ts      ← createServer(config) → http.Server
    routes.ts     ← definição das rotas
    cache.ts      ← VaultState com TTL (evita re-scan a cada request)
```

### Cache

O vault é re-scanneado no máximo a cada `CACHE_TTL_MS` (default: 30s). Um `chokidar` watch nos diretórios de projeto invalida o cache imediatamente quando um `.md` é modificado.

---

## Rotas

| Método | Path | Resposta |
|--------|------|----------|
| GET | `/status` | Resumo: projetos, agentes, último scan |
| GET | `/projects` | `VaultProject[]` completo |
| GET | `/projects/:id` | Projeto individual com tasks |
| GET | `/agents` | `VaultAgent[]` |
| GET | `/morning` | Markdown do brief matinal (on-demand) |
| GET | `/events` | SSE stream para notificações de mudanças |

### `/status` response

```json
{
  "projects": 12,
  "agents": 5,
  "pendingTasks": 23,
  "lastScan": "2026-05-20T09:00:00Z",
  "vaultPath": "/home/jvcm/tmp"
}
```

---

## CLI

```bash
taverna serve              # inicia na porta 4000
taverna serve --port 3333
```

Systemd user unit:

```ini
# ~/.config/systemd/user/taverna-server.service
[Service]
ExecStart=/home/jvcm/tools/taverna/taverna.sh serve
Restart=always

[Install]
WantedBy=default.target
```

---

## Testes

- `GET /projects` retorna lista correta a partir de fixture
- Cache invalida quando arquivo é modificado (mock chokidar)
- `GET /projects/:id` retorna 404 para ID inexistente
- SSE envia evento quando VaultState muda

---

## Dependências esperadas

```json
"chokidar": "^3.6.0"
```

Sem framework HTTP — usa `node:http` nativo para manter o bundle pequeno.
