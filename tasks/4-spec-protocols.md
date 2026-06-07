---
id: 4-spec-protocols
title: "Spec: adaptadores de protocolo (HTTP, MCP, CLI)"
status: 🧠
project: taverna
progresso: 60
---

Três modos de invocação independentes. Nenhum adaptador contém lógica de negócio.

| Modo | Invocação | Ciclo de vida |
|---|---|---|
| CLI | `taverna <comando>` | single-shot, executa e sai |
| HTTP | `taverna serve` | server persistente, opcional |
| MCP | `taverna mcp` ou SSE via HTTP | stdio efêmero ou reutiliza o server HTTP |

---

## Convenção de nomes

| Origem | HTTP | MCP | CLI |
|---|---|---|---|
| core | `GET /api/<id>` | `taverna_<id>` | `taverna <id>` |
| plugin | `GET /api/<namespace>/<id>` | `taverna_<namespace>_<id>` | `taverna <namespace> <id>` |

O método HTTP (`GET`/`POST`) vem do `CommandDef.http.method` do comando. Plugins com `expose` omitido são registrados nos três protocolos automaticamente.

---

## HTTP

### Registro automático

Todos os comandos com `expose` incluindo `'http'` são registrados pelo adaptador. Plugins com `httpRoutes` são registrados como-estão (path livre, sem namespace forçado).

### Mapeamento de params

- `GET` → query string (`?param=value`)
- `POST` → body JSON (`Content-Type: application/json`)
- Path params (`:id`) → extraídos do path e merged nos params

### Resposta

```jsonc
// sucesso
{ "data": <retorno do handler> }

// erro
{ "error": "mensagem", "code": "COMMAND_NOT_FOUND" }  // 4xx/5xx conforme o tipo
```

### Rotas fixas do core

```
GET  /api/config/schema   → JSON Schema completo (core + plugins carregados)
GET  /api/<id>            → comando core
POST /api/<id>            → comando core (write)
GET  /api/<ns>/<id>       → comando de plugin
POST /api/<ns>/<id>       → comando de plugin (write)
GET  /events              → SSE — stream de eventos do taverna (push, sem polling)
```

Porta padrão: `3861`.

### Ciclo de vida

`taverna serve` deve rodar como **systemd service** (não timer) — processo persistente que reinicia automaticamente se cair:

```ini
# /etc/systemd/system/taverna.service
[Service]
ExecStart=taverna serve --vault /home/user/notas
Restart=on-failure
```

Controle: `systemctl start|stop|status|enable taverna`.

---

## MCP

### Registro automático

Todos os comandos com `expose` incluindo `'mcp'` viram MCP tools. O schema do tool é gerado a partir do `CommandDef.params` (JSON Schema).

Tool name: `taverna_<id>` (core) ou `taverna_<namespace>_<id>` (plugin).
Input schema: derivado de `params`. Output: JSON serializado em `content[0].text`.

### Transports

**stdio** (`taverna mcp`) — o cliente MCP spawna o processo. Efêmero, vive enquanto durar a sessão. Nunca escrever em stdout fora do protocolo MCP.

**HTTP SSE** — quando `taverna serve` está rodando, o mesmo conjunto de tools é acessível via SSE:
```
GET  /mcp/sse       → stream SSE (MCP over HTTP)
POST /mcp/message   → envio de mensagens do cliente
```

O cliente escolhe o transport. Se o servidor HTTP estiver up, prefira SSE — evita spawnar um processo extra. Se não estiver, use stdio. Os dois expõem exatamente os mesmos tools; não há duplicação de lógica.

---

## CLI

### Registro automático

Todos os comandos com `expose` incluindo `'cli'` viram subcomandos. Plugins com `cliCommands` registram subcomandos customizados com acesso total ao `program`.

### Estrutura

```
taverna <id> [--param value]          # comando core
taverna <namespace> <id> [--param]    # comando de plugin
taverna serve [--port 2948]           # infraestrutura HTTP
taverna mcp                           # infraestrutura MCP
```

### Params

Cada param de `CommandDef.params` vira uma flag `--<param>`. Params obrigatórios sem valor encerram com erro e mensagem de uso.

---

## O que os adaptadores NÃO fazem

- Não validam regras de negócio — apenas tipos e presença de params obrigatórios
- Não conhecem vault, projetos ou canvas
- Não chamam outros comandos entre si
- Não têm estado próprio
