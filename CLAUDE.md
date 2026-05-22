# Taverna — CLAUDE.md

## O que é este projeto

Taverna é um **orquestrador de agentes Claude Code** — um motor que lê projetos de um vault Obsidian, constrói prompts com contexto preciso e spawna instâncias do `claude` CLI para executar trabalho real em cada projeto.

A metáfora central é um **deadpool de taverna**: projetos são contratos na taverna, agentes são mercenários, e o executor é o dono que distribui os contratos para quem é elegível no momento. O `@dev-agent` trabalha em projetos de infra, o `@study-assistant` estuda matérias da USP, o `@planner` cuida de side projects.

Não é um chatbot. Não tem interface interativa. É um sistema de automação headless que roda em segundo plano via systemd.

## Fonte de verdade

O vault vive em `~/tmp` (configurável via `VAULT_PATH`). A descrição do próprio projeto taverna está em:
```
~/tmp/10_Projects/taverna/taverna.md
```

O README.md no repo documenta a API pública (comandos, eventos, estrutura). Este CLAUDE.md explica o funcionamento interno para agentes que vão modificar o código.

## Arquitetura em camadas

```
systemd timers
  └─ taverna execute / taverna schedule
       └─ executor.ts — spawna `claude --print --output-format json`
            ├─ prompt.ts — constrói o prompt a partir de diretiva + tasks + contexto
            ├─ loki.ts — emite eventos JSON (agent_run, project_snapshot)
            └─ vault/ — lê projetos, tasks, agentes do sistema de arquivos
```

### Fluxo de execução de um agente

1. `scanVault` lê todos os projetos em `10_Projects/` e agentes em `60_Agents/1_Directives/`
2. `isProjectDue` verifica se o projeto precisa rodar (baseado em `runEvery` e `_last_run`)
3. `buildPrompt` monta o prompt: diretiva do agente + Task Completion Protocol + tasks pendentes + contexto do projeto
4. `spawnClaude` executa `claude --print --output-format json` com o prompt via stdin
5. O resultado é parseado, tokens contados, custo calculado, evento `agent_run` emitido
6. `updateProjectStatus` atualiza `_last_run`, `_last_status`, `_runs_total` no frontmatter do projeto
7. `appendLogbook` registra o resultado no logbook do agente em `60_Agents/2_Logbooks/`

### Pipeline de agentes

É possível encadear agentes em sequência via `runPipeline`. O output de cada agente é passado como `previousOutput` para o próximo — usado no projeto taverna com:
```
@tdd-writer → @dev-agent → @reviewer
```

## Estrutura do vault (`~/tmp`)

```
10_Projects/
  <id>/
    <id>.md          ← frontmatter do projeto (tipo, priority, agent, runEvery, _last_run)
    tasks/
      <task-id>.md   ← frontmatter: progresso (0-100), prioridade, deadline
      archive/       ← tasks concluídas (progresso: 100)
    logbook.md       ← log de execuções do projeto

60_Agents/
  1_Directives/
    <agent>/
      <agent>.md     ← diretiva base do agente
      modes/         ← diretivas especializadas (vhdl.md, python.md, teoria.md...)
      conventions.md ← convenções adicionais (incluídas automaticamente)
  2_Logbooks/
    <agent>.md       ← log cronológico do agente
  5_Inbox/
    YYYYMMdd-morning.md  ← brief matinal gerado por `taverna morning`
```

## Tipos de projeto e agentes padrão

| tipo | Agente padrão | Política de horário |
|------|---------------|---------------------|
| `USP` | `@study-assistant` | 09:00, EOD (17h+), e qualquer hora |
| `BB` | `@planner` | qualquer hora |
| `*` | `@dev-agent` | qualquer hora |

Projetos podem sobrescrever com `schedule_compose: override` + `schedule_steps` no frontmatter.

## Frontmatter de projeto (campos relevantes)

```yaml
id: PSI3451
tipo: USP              # USP | BB | *
priority: high         # high | medium | low
agent: '@study-assistant'
run_every: daily       # hourly | daily | weekly | monthly | never
target: 'jvcm@start:tools/taverna/'  # resolvido para /home/jvcm/tools/taverna/
_last_run: '2026-05-21T17:37:26.689Z'
_last_status: success  # success | failed
_runs_total: 15
```

O campo `target` é resolvido pelo executor (`resolveTarget` em `prompt.ts`) e injetado no prompt como `**Target:** /home/jvcm/...` — é o diretório de trabalho que o agente deve usar.

## Task Completion Protocol

Todo agente recebe no prompt um protocolo obrigatório de conclusão de tasks. Ao terminar uma task, o agente deve:
1. Atualizar `progresso:` no frontmatter da task
2. Mover para `tasks/archive/` se `progresso: 100`
3. Appender entrada no `logbook.md` do projeto no vault
4. Terminar o response com `RESULTADO: <resumo>`

O `RESULTADO:` é parseado pelo executor e salvo no logbook do agente.

## Observabilidade

Eventos são emitidos como JSON lines para stdout → capturado pelo journal do systemd → ingerido pelo promtail → Loki → Grafana (`:3000`).

```json
{"event":"agent_run","project":"taverna","agent":"@dev-agent","status":"success",
 "duration_s":42.3,"tokens_in":12000,"tokens_out":800,
 "cache_read":9000,"cache_fill":3000,"cost_usd":0.0031,"cache_hit_pct":75.0}
```

Custo calculado com preços do Sonnet 4.6: $3/MTok in, $15/MTok out, $3.75/MTok cache_fill, $0.30/MTok cache_read.

Para trocar para Kafka no futuro: substituir `StdoutBus` por `KafkaBus` em `src/pm/event-bus.ts` via `setEventBus()`. O placeholder já existe no arquivo.

## Serviços systemd

```
taverna-server.service    # HTTP Status Server na porta 2948 — sempre ligado (Restart=always)
taverna-executor.service  # oneshot — roda taverna execute
taverna-inbox.service     # oneshot — roda taverna inbox
taverna-morning.service   # oneshot — roda taverna morning
```

O server fica always-on. Os outros são disparados por timers (ver `activate-timers.sh`).

## Comandos principais

```bash
taverna execute           # roda agentes em todos os projetos elegíveis agora
taverna execute --drain   # roda até esgotar tasks (≤3 por projeto)
taverna schedule          # daemon com tick de 60s (substitui executor+timer)
taverna morning           # gera brief matinal em 60_Agents/5_Inbox/
taverna inbox             # processa 00_Inbox com Claude Code
taverna snapshot          # emite project_snapshot para todos os projetos
taverna policy [id]       # inspeciona políticas efetivas (sem executar)
taverna clockify sync     # sincroniza horas do Clockify nos frontmatters
taverna serve --port 2948 # HTTP Status Server
```

## Policy Resolution (`src/pm/policy-resolver.ts`)

As permissões do agente são resolvidas em cadeia de escopo (scope chain), do mais geral ao mais específico:

```
agent.permissions (directive frontmatter)
  └─ inferProjectTools(project.raw['target'])
       └─ Write, Edit, Read  — sempre que o target existe
       └─ Bash(git *)        — adicional se target/.git existir
```

**Regra crítica:** inferência só ocorre quando o agente JÁ tem `permissions:` declarado. Se o agente não declara permissões, `bypassPermissions` continua em vigor e nada é injetado — para não tornar a política mais restritiva do que estava.

`resolvePolicy(agent, project)` retorna `ResolvedPolicy` com:
- `permissionMode` — `'bypassPermissions'` ou `'default'`
- `allowedTools` — lista efetiva para `--allowedTools`
- `agentTools` / `inferredTools` — breakdown por origem (visível em `taverna policy`)

## Invariantes importantes

- **Nunca atualizar `_last_run` em falha.** Falhas devem retentar no próximo ciclo. Só avança em sucesso (ver `runOnce` em `cli.ts`).
- **O vault é a fonte de verdade.** Nenhum estado em memória ou banco — tudo lido do sistema de arquivos a cada execução.
- **`bypassPermissions` é o padrão** quando o agente não declara `permissions:` no frontmatter. Agentes com `permissions:` usam modo `default` com `--allowedTools`.
- **tmux para observabilidade ao vivo.** O executor cria sessões tmux `taverna-<agent>-<project>` que o usuário pode fazer `attach` para acompanhar em tempo real. Sessões são destruídas 3s após o término.
- **Detecção automática de modo** para `@study-assistant`: a task é analisada por regex para detectar o modo de estudo (vhdl, matlab, embarcados, python, teoria) e a diretiva correspondente de `modes/` é incluída automaticamente.

## Stack

- TypeScript + Node.js (ESM)
- `commander` — CLI
- `gray-matter` — parse de frontmatter YAML
- `vitest` — testes
- Build: `tsc` → `dist/`; instalado globalmente via `npm link` ou `npm install -g`
