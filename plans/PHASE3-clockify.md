# Phase 3 — Clockify Bridge

## Objetivo

Sincronizar horas de deep work do Clockify com os projetos do vault, usando as convenções já estabelecidas: **nome do projeto Clockify = vault ID**, **cliente Clockify = tipo de projeto (USP/BB/*)**.

---

## Convenção

| Clockify | Vault |
|----------|-------|
| Nome do projeto | `id` do projeto (ex: `PSI3451`, `javalanche`) |
| Cliente | Tipo: `USP`, `BB`, `*` |
| Tag | Opcional: sprint ou contexto |

Isso elimina configuração manual — a correspondência é automática por nome.

---

## O que já existe

`/home/jvcm/tools/clockify/` em Python tem:
- `fetch.py` — busca time entries da API
- `kpi.py` — calcula KPIs (DeepWorkHoursKPI, etc.)
- `projects.py` — mapeia entradas para projetos do vault
- `dashboard.py` — gera markdown de KPIs

O objetivo da Phase 3 é **reescrever/adaptar em TypeScript** como módulo do taverna, integrando com o `VaultProject`.

---

## Módulos

```
src/
  clockify/
    types.ts     ← TimeEntry, ClockifyProject, ClockifyConfig
    client.ts    ← fetchEntries(from, to) via Clockify REST API
    sync.ts      ← matchEntries(entries, projects) → DeepWorkStats[]
    vault.ts     ← writeDeepWorkToFrontmatter(project, stats)
```

### `DeepWorkStats`

```typescript
interface DeepWorkStats {
  projectId: string         // vault ID
  tipo: ProjectType
  totalHours: number
  lastEntry: string         // ISO timestamp
  weeklyHours: number
  entries: TimeEntry[]
}
```

### Escrita no vault

Adiciona campos ao frontmatter do projeto:

```yaml
deepwork_total_h: 12.5
deepwork_week_h: 3.0
deepwork_last: '2026-05-19T22:00:00'
```

### Configuração (`src/config.ts`)

```typescript
interface ClockifyConfig {
  apiKey: string            // CLOCKIFY_API_KEY env
  workspaceId: string       // CLOCKIFY_WORKSPACE_ID env
  userId: string            // CLOCKIFY_USER_ID env
}
```

---

## CLI

```bash
taverna clockify sync          # sincroniza últimos 7 dias
taverna clockify sync --days 30
taverna clockify status        # mostra horas por projeto esta semana
```

---

## Testes

- `matchEntries` mapeia corretamente por nome (case-insensitive)
- `matchEntries` ignora entradas sem projeto correspondente no vault
- `writeDeepWorkToFrontmatter` não sobrescreve outros campos
- `sync` com `--dry-run` mostra o que seria escrito sem modificar arquivos

---

## Dependência nova esperada

Nenhuma além de `node:fetch` (nativo no Node 18+).

## Variáveis de ambiente

```
CLOCKIFY_API_KEY=
CLOCKIFY_WORKSPACE_ID=
CLOCKIFY_USER_ID=
```
