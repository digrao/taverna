# taverna

Vault manager TypeScript — CLI para o vault Obsidian, substituto incremental do project-manager.

**Stack:** TypeScript · Vitest · gray-matter · commander  
**Vault:** `~/tmp` (configurável via `VAULT_PATH`)  
**Localização:** `/home/jvcm/tools/taverna/`

## Comandos

```bash
npm run morning        # gera brief em 60_Agents/5_Inbox/YYYYMMdd-morning.md
npm run morning:dry    # imprime no terminal
npm test               # suite de testes
npm run typecheck      # verificação TypeScript
```

```bash
# Asset manager (Phase 2A)
taverna assets store <project>   # move assets → remoto, cria .asset, atualiza .gitignore
taverna assets pull <project>    # baixa assets faltando (desktop, via copyparty)
taverna assets status <project>  # local vs remoto

# Agent executor (Phase 2B)
taverna run @study-assistant --project PSI3451
taverna execute                  # roda agentes em todos os projetos elegíveis
```

## Módulos

- [`src/vault/`](src/vault/README.md) — leitura do vault (projetos, tasks, agentes, logbooks)
- [`src/morning/`](src/morning/README.md) — geração do brief matinal
- `src/assets/` — asset manager com ponteiros `.asset` (Phase 2A, planejado)
- `src/pm/` — executor de agentes Claude com guardrail de tokens (Phase 2B, planejado)

## Fases

Ver [`plans/`](plans/README.md) para roadmap completo.

| Fase | Status |
|------|--------|
| Phase 1 — Vault + Morning | Concluída |
| Phase 2 — Assets + Executor | Planejada |
| Phase 3 — Clockify | Planejada |
| Phase 4 — HTTP Server | Planejada |
