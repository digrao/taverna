# vault module

Lê e escreve o vault Obsidian. API pública via `index.ts`.

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `types.ts` | Interfaces: `VaultProject`, `VaultTask`, `VaultAgent`, `LogbookEntry` |
| `frontmatter.ts` | gray-matter + extractors bilíngues (PT/EN) |
| `project.ts` | `scanProjects`, `detectProjectType` |
| `task.ts` | `readProjectTasks`, `progressToState` |
| `agent.ts` | `discoverAgents`, `readAgent` |
| `logbook.ts` | `readLogbook` (2 formatos), `appendLogbook` |
| `index.ts` | API pública: `scanVault` |

## Detecção de tipo (ordem de precedência)

| Passo | Condição |
|-------|----------|
| 1. Explícito | `tipo: USP \| BB \| *` no frontmatter (preferido) |
| 2. Alias legado | `type: work` → BB · `type: study` → USP |
| 3. Heurística | `cardId` presente → BB · pasta com prefixo USP → USP |
| 4. Fallback | `*` |

Para adicionar novos tipos ou aliases, edite `TIPO_ALIASES` em `project.ts`.

## Estado das tasks

```
progresso == 0    → tarefinha     (pequena, cabe numa sessão)
progresso 1–49%   → tarefa        (em planejamento)
progresso 50–99%  → em-progresso
progresso == 100  → concluida
```

## Estrutura esperada no vault

```
10_Projects/<id>/
  <id>.md              ← frontmatter do projeto (agent:, id:, type:, ...)
  tasks/
    tarefa-1.md        ← frontmatter com progresso:, status:
  assets/
    arquivo.pdf.asset  ← ponteiro (Phase 2A)
    arquivo.pdf        ← gitignored, baixado on-demand

60_Agents/
  1_Directives/
    @agente.md         ← instruções do agente
  2_Logbooks/
    @agente.md         ← append-only, execuções cronológicas
```
