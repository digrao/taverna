# taverna

Orquestrador de projetos vault-first — CLI TypeScript que substitui o `project-manager` Python.

**Stack:** TypeScript · Vitest · gray-matter · commander  
**Vault:** `~/tmp` (configurável via `VAULT_PATH`)

## Comandos

```bash
npm run morning        # gera brief em 60_Agents/5_Inbox/YYYYMMdd-morning.md
npm run morning:dry    # imprime no terminal
npm test               # suite de testes
npm run typecheck      # verificação TypeScript
```

```bash
# Inbox
taverna inbox                    # processa 00_Inbox → 40_Archives/projetos-incompletos

# Migração de projetos
taverna migrate <archive-path>   # promove archive → 10_Projects via Claude Code
taverna migrate <path> --dry-run # mostra o prompt sem escrever nada
taverna migrate <path> --id <id> # sobrepõe o ID do projeto

# Asset manager
taverna assets store <project>   # move assets → remoto, cria .asset, atualiza .gitignore
taverna assets pull <project>    # baixa assets faltando (via copyparty)
taverna assets status <project>  # local vs remoto

# Agent executor
taverna run @study-assistant --project PSI3451
taverna execute                  # roda agentes em todos os projetos elegíveis
```

## Módulos

| Módulo | Descrição |
|--------|-----------|
| `src/vault/` | Leitura do vault — projetos, tasks, agentes, logbooks |
| `src/morning/` | Brief matinal com prioridades e logbooks |
| `src/inbox/` | Processa `00_Inbox` com Claude Code |
| `src/assets/` | Ponteiros `.asset` + upload copyparty/gdrive |
| `src/pm/` | Executor de agentes Claude com guardrail de tokens |
| `src/migrate/` | Promoção de projetos do archive via Claude Code |
| `src/clockify/` | (Phase 3) Sincronização de deep work |
| `src/server/` | (Phase 4) HTTP status server |

## Status

| Fase | Status |
|------|--------|
| Phase 1 — Vault + Morning | Concluída |
| Phase 2 — Assets + Executor | Concluída |
| Migrate — Archive → Active | Concluída |
| Phase 3 — Clockify Bridge | Próxima |
| Phase 4 — HTTP Server | Planejada |

O roadmap completo vive em `10_Projects/taverna/tasks/` no vault.
