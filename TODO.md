# Taverna — TODO

Pending work grouped by area.

---

## Open source support

Making taverna welcoming to external contributors.

- [ ] `CONTRIBUTING.md` — local setup, project structure, plugin guide, commit conventions
- [ ] `.github/ISSUE_TEMPLATE/` — bug report and feature request templates
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` — CI checklist
- [ ] README badges — CI status, npm version, license
- [ ] README section "Writing a plugin" — full interface with `features`, `httpRoutes`, `onLoad`, `beforeTick`, `afterRun` examples
- [ ] `taverna create-plugin` scaffold — add `onLoad` and `httpRoute` examples and a generated `README.md`

---

## HTTP server themes

The dashboard and flow views use hardcoded colors. Extract to CSS variables and add theme support.

- [ ] Extract all colors to CSS custom properties (`--bg`, `--accent`, `--text-muted`, ...) in `dashboard.ts` and `flow.ts`
- [ ] Implement `light` theme via `[data-theme="light"]` override block
- [ ] Theme selection via `?theme=` query param and `taverna-theme` cookie
- [ ] Toggle button in the dashboard header
- [ ] Built-in themes: `dark` (current default), `light`, `nord`, `gruvbox`
- [ ] `TAVERNA_THEME` env var or `~/.config/taverna/.env` for persistent default

---

## Notifications

- [ ] `neo-matrix` — stable public API + `listen()` for bidirectional comms (`digrao/neo-matrix`)
- [ ] `taverna x neo-matrix` — register `MatrixNotifier` on `NotificationBus` at startup; Matrix commands (`!work`, `!status`) in `taverna serve`
- [ ] `forge x neo-matrix` — deploy/rollback notifications (tracked in `digrao/forge`)
