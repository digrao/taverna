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
  README.md            ← entrypoint do projeto (frontmatter: agent:, id:, tipo:, ...)
  tasks/
    tarefa-1.md        ← frontmatter com progresso:, status:
    archive/           ← tasks concluídas
  assets/
  .git/                ← opcional: projeto é um repositório git (isGitRepo: true)

  # Fallback legado (ainda suportado durante migração):
  <id>.md              ← usado se README.md não existir

60_Agents/
  1_Directives/
    <name>/
      directives.md    ← frontmatter com name:, permissions:, runner:
  2_Logbooks/
    <name>.md          ← append-only, execuções cronológicas
```

## Política de projetos

- Todo projeto é um **diretório** — arquivos `.md` soltos em `10_Projects/` não são mais escaneados.
- O entrypoint é sempre `README.md`. O fallback `<id>.md` existe apenas para compatibilidade durante a migração.
- Todo agente deveria declarar `permissions:` explícito. Sem `permissions:`, o agente roda em modo bypass (todas as ferramentas permitidas).
- Um projeto pode ser um repositório git independente (com `.git/` na pasta). Taverna detecta isso e seta `isGitRepo: true`, e o `policy-resolver` infere permissões git automaticamente.
