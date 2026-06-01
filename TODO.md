# Taverna — TODO

Sequential backlog for the core engine. Plugin-specific work lives in each plugin's `TODO.md`.

---

## 1 — Prune & simplify (vault task 52)

The union type (`USPProject | BBProject | MetaProject`) is gone — `VaultProject` is flat. Remaining cleanup:

- [ ] Remove or replace `src/migrate/` — rarely used; candidate for a simple shell script or deletion
- [ ] Evaluate `src/clockify/` — keep only if `deepwork_week_h` scorer field is actively used; otherwise remove and simplify scorer
- [ ] `src/morning/` has moved to `taverna-briefing` plugin — remove from core if fully migrated
- [ ] Drop `uspFolderPrefixes` from `TavernaConfig` (USP prefix detection belongs to plugin or is unused)

---

## 2 — Config & README (vault task 58)

- [ ] `TavernaConfig`: remove fields belonging to pruned modules (`clockify`, `gdrive*`, `copypartyUrl`)
- [ ] `agentDefaults` — move USP/BB-specific defaults to example; core default: `{ '*': '@dev-agent' }`
- [ ] `uspFolderPrefixes` — empty array by default or removed
- [ ] `VAULT_PATH` — emit a clear warning (not throw) when unset; allow `~/.config/taverna/.env` to supply it
- [ ] README: installation, minimal config, vault structure, essential commands, MCP setup, how to write an agent

---

## 3 — Vault structure standardization

### Vault links (task 30)

- [ ] Audit all wikilinks in `~/tmp` vault — replace bare `[[id]]` with `[[folder/id]]` for unambiguous resolution
- [ ] Script `scripts/standardize-links.ts` — dry-run + apply mode

### Project entrypoints (task 47, depends on 30)

- [ ] Migrate `$id.md` / `$id/$id.md` → `$id/README.md` with one-shot script
- [ ] Update `scanProjects()` to expect `README.md` as the single entrypoint (keep `$id.md` fallback during transition)

---

## 4 — Matrix notifications (vault task 60)

- [x] `src/notifications/matrix.ts` — `MatrixNotifier` using `@digrao/neo-matrix`
- [x] Register `MatrixNotifier` on `NotificationBus` at startup if `MATRIX_*` env vars are present
- [ ] `taverna serve` — Matrix listener for `!work`, `!status` commands (`MATRIX_LISTEN=true`)

---

## 5 — Live execution view (vault task 27)

Route `/run/:id` with real-time logs and prompt inspection.

- [ ] Prompt store: save `PromptSnapshot` to `~/.cache/taverna/prompts/{project}/{ts}-{agent}.json` after each run
- [ ] `GET /api/prompt/:id` — dry-run prompt build, returns snapshot
- [ ] `GET /api/prompt/:id/history` — last N snapshots (no prompt text)
- [ ] `/run/:id` page — tabs: Execution (SSE log stream) | Prompt (dry-run, history, diff)
- [ ] New SSE event types: `agent_log`, `agent_tool`, `agent_response`, `agent_done`, `prompt_ready`
- [ ] Task selector in Execution tab — checkbox list before confirming run

---

## 6 — Grafana observability (vault task 26)

- [ ] Instrument `scheduler/` with timers → emit `agent_run` duration + status to Loki
- [ ] Metrics: `taverna_task_duration_seconds`, `taverna_run_total`, `taverna_tokens_used`
- [ ] Dashboard `task-observability.json`: heatmap, top-N by duration, timeline, failure alerts
- [ ] Grafana iframe in `/run/:id` (aba "Grafana"), filtered by `var-project`

---

## 7 — Bootstrap square-clock (vault task 49)

Extract the scheduling and clockify responsibilities from core:

- [ ] `~/tools/square-clock` — standalone TypeScript project
- [ ] Move `src/clockify/` → `square-clock/src/clockify/`
- [ ] Move scheduler/idle logic → `square-clock/src/scheduler/`
- [ ] Taverna consumes `GET /api/score/:id` and `POST /api/schedule/run` from square-clock
- [ ] `systemd/square-clock.service` + `.timer`

---

## 8 — Open source support (vault task 62)

- [ ] `CONTRIBUTING.md` — setup, project structure, plugin guide, commit conventions
- [ ] `.github/ISSUE_TEMPLATE/` — bug report + feature request
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` — CI checklist
- [ ] README badges: CI, npm version, license
- [ ] README section "Writing a plugin" — full interface with examples
- [ ] `taverna create-plugin` scaffold — add `onLoad`, `httpRoute` examples + generated README

---

## 9 — HTTP server themes (vault task 63)

- [ ] Extract colors to CSS custom properties (`--bg`, `--accent`, `--text-muted`, …) in `dashboard.ts` and `flow.ts`
- [ ] `light` theme via `[data-theme="light"]` override block
- [ ] Theme via `?theme=` query param + `taverna-theme` cookie
- [ ] Toggle button in dashboard header
- [ ] Built-in themes: `dark` (default), `light`, `nord`, `gruvbox`
- [ ] `TAVERNA_THEME` env var for persistent default

---

## Plugin TODOs

Work specific to each plugin lives in:

- `~/tools/taverna-slides/TODO.md`
- `~/tools/taverna-briefing/TODO.md`
- `~/tools/taverna-assets/TODO.md`
- `~/tools/taverna-edisciplinas/` — see vault project `10_Projects/taverna-edisciplinas/`
