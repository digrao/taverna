# taverna

Orquestrador de agentes Claude Code — CLI TypeScript que lê projetos de um vault Obsidian, constrói prompts com contexto preciso e spawna instâncias do `claude` CLI.

**Stack:** TypeScript · Vitest · gray-matter · commander  
**Vault:** `~/tmp` (configurável via `VAULT_PATH`)  
**Projeto:** `~/tmp/10_Projects/taverna/taverna.md`

---

## 📚 Documentação

### Para Desenvolvedores

- [`CLAUDE.md`](CLAUDE.md) — Arquitetura completa, comandos, invariantes
- [`UNIFICATION_STATUS.md`](UNIFICATION_STATUS.md) — Status da unificação CLI/HTTP/MCP
- [`UNIFICATION_GUIDE.md`](UNIFICATION_GUIDE.md) — Como adicionar um novo handler
- [`REFACTORING.md`](REFACTORING.md) — Plano detalhado de migração fase por fase
- [`DELIVERABLES.md`](DELIVERABLES.md) — Tudo o que foi entregue (Fase 1)

### Para Agentes

Modular `CLAUDE.md` — referência autoritativa do projeto.
