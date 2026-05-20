# Plano de Modernização — Taverna substitui project-manager

Elaborado em 2026-05-20. Objetivo: migrar toda a orquestração de agentes do `project-manager` (Python) para o `taverna` (TypeScript) e desligar o Python completamente.

---

## Situação atual (2026-05-20)

| Componente | Estado |
|---|---|
| `project-manager` (Python) | funcional, em uso ativo, 3 timers systemd |
| `taverna` Phase 1 — Vault + Morning | ✅ concluída |
| `taverna` Phase 2 — Assets + Executor | ✅ concluída (esta sessão) |
| `project-manager.service` (loop Restart=always) | ✅ corrigido → oneshot, desativado |
| Frontmatter update (`_last_run`, `_last_status`, `_runs_total`) | ✅ implementado |
| Append ao logbook após execução | ✅ implementado |
| `taverna-executor.timer` + `taverna-morning.timer` | criados, ainda não ativados |

---

## Etapa 1 — Taverna assume execução (próxima)

**O que fazer:**
1. Ativar os timers do taverna:
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now taverna-executor.timer taverna-morning.timer
   ```
2. Desabilitar `agent-executor.timer` do Python:
   ```bash
   systemctl --user disable --now agent-executor.timer
   ```
3. Manter `agent-planner.timer` e `agent-report.timer` do Python até as etapas 2 e 3.

**Risco:** o `@planner` do Python tem integração com Taiga. O taverna ainda não porta isso.

---

## Etapa 2 — `@planner` no taverna

Antes de portar, a decisão aberta em `60_Agents/Melhorias.md` precisa ser tomada: orquestrador global vs pontual.

**Proposta decidida (a confirmar):** `@planner` vira orquestrador global — lê `Backlog.md` de todos os projetos, gera `STATUS.md` na raiz do vault, sem Taiga.

Depois de implementado:
- Desabilitar `agent-planner.timer` do Python.

---

## Etapa 3 — Report diário no taverna

Implementar `taverna report`:
- Lê logbooks das últimas 24h de `60_Agents/2_Logbooks/`
- Gera `60_Agents/5_Inbox/YYYYMMdd.md`

Depois de implementado:
- Desabilitar `agent-report.timer` do Python.

---

## Etapa 4 — Limpar agentes duplicados/sobrepostos

Das decisões abertas em `60_Agents/Melhorias.md`:

| Ação | Agente |
|---|---|
| Aposentar | `@vhdl-agent` — coberto pelo modo V do `@study-assistant` |
| Renomear | `@frontend-dev` → `@ui-lib-dev` para distinguir do `@frontend-specialist` |
| Reduzir escopo | remover BD de `@backend-specialist` — já coberto por `@db-manager` |
| Decidir | `@study-assistant` monolito (Opção A) vs sub-agents (B) vs roteamento no taverna (C) |

---

## Etapa 5 — Desligar Python

Quando todos os timers estiverem no taverna:
```bash
systemctl --user disable --now agent-planner.timer agent-report.timer
# arquivar ou remover ~/tools/project-manager
```

---

## Ordem sugerida

```
Etapa 1 → Etapa 3 → Etapa 4 → Etapa 2 → Etapa 5
```

Etapa 2 (`@planner`) é a mais complexa — depende de decisão arquitetural. As demais são mecânicas.
