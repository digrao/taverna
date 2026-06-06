# Changelog

## [1.0.0] — unreleased

### Added
- Canvas-driven flow engine: state transitions, node schema (`required`, `default`, `infer`), ID-based node lookup
- Template language for `default` values: strftime sequences + `{{field|fallback}}` interpolation
- Core command groups: monitoring, vault, execution, tasks, movement
- Plugin interface: commands, HTTP routes, scheduling slots
- Notification bus: pluggable transports
- Protocol adapters: HTTP, MCP, CLI — all expose the same core commands
- Autodocumenting JSON config schema
- Wiki: Template Language, Getting Started, CLI Reference, HTTP API, Plugin System, Scheduling
