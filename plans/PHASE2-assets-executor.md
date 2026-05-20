# Phase 2 — Assets + Agent Executor

## Objetivo

Adicionar execução de agentes via CLI do Claude com guardrail de tokens, e gerenciamento de assets pesados fora do vault principal.

---

## 2A: Asset Manager

### Problema

O vault tem ~7.9GB em `assets/` distribuídos entre projetos PSI. O git do vault deve ser leve (só `.md` e ponteiros) para que o clone no Android seja rápido e sem crashes. Assets pesados devem viver em servidor externo e serem baixados sob demanda.

### Solução

Arquivos `.asset` por arquivo (ponteiros rastreados pelo git) + arquivos reais gitignored + plugin Obsidian para download on-demand.

Backends: **copyparty** (rede local, rápido, controlável) com fallback **Google Drive** (`jv:` via rclone no desktop; Drive API no plugin para Android sem depender de rclone).

### Estrutura

Similar ao `dn`: ponteiro por arquivo, estrutura de diretórios preservada, arquivo real separado do ponteiro.

```
10_Projects/PSI3451/
  assets/
    1_Aula/
      aula2_pratica.pdf.asset   ← rastreado pelo git (ponteiro)
      aula2_pratica.pdf         ← gitignored (arquivo real, baixado on-demand)
    7_Aula_Memórias/
      memorias_20.pdf.asset
      memorias_20.pdf           ← gitignored
  .gitignore                    ← ignora *.pdf, *.ppt, *.zip, *.vhd, etc. em assets/
```

### Formato `.asset`

Texto plano, sem JSON — leitura direta por humano e plugin:

```
taverna-asset-v1
name: aula2_pratica.pdf
sha256: abc123def456...
size: 2048000
copyparty: http://192.168.1.100:3900/vault/PSI3451/assets/1_Aula/aula2_pratica.pdf
gdrive: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

### Novos módulos

```
src/
  assets/
    pointer.ts     ← readPointer, writePointer, AssetPointer
    store.ts       ← storeAssets(project) → upload + cria .asset + atualiza .gitignore
    pull.ts        ← pullAssets(project) → baixa .asset faltando/divergentes
    hash.ts        ← sha256File via node:crypto
    gitignore.ts   ← addToGitignore(dir, patterns[])
```

### CLI

```bash
taverna assets store <project>   # move real → remoto, cria .asset, atualiza .gitignore
taverna assets pull <project>    # baixa .asset faltando (desktop, usa copyparty)
taverna assets status <project>  # mostra local vs remoto
```

### Plugin Obsidian (`taverna-assets`)

Plugin TypeScript mínimo que:
1. Registra handler para arquivos `.asset`
2. Ao abrir: tenta copyparty (timeout 2s para detectar rede local), fallback → Google Drive API
3. Baixa arquivo para mesmo diretório sem sufixo `.asset`
4. Abre arquivo real no Obsidian

Credenciais GDrive: OAuth2 embutido no plugin (funciona no Android sem rclone).

### Workflow

**Android (vault leve):**
```
git clone vault          →  só .md + .asset  →  rápido, sem crash
toca .asset no Obsidian  →  baixa do GDrive  →  PDF abre
```

**Desktop:**
```
git pull                       →  .asset atualizados
taverna assets pull PSI3451    →  baixa via copyparty (rede local)
```

### Testes

- `readPointer` faz parse de todos os campos corretamente
- `writePointer` produz formato válido (linha `taverna-asset-v1` + campos `key: value`)
- `storeAssets` cria `.asset` para cada arquivo pesado e atualiza `.gitignore`
- `pullAssets` pula arquivos cujo sha256 local já bate com o ponteiro
- `sha256File` retorna hash correto para arquivo conhecido

### Extensões consideradas pesadas (padrão)

`*.pdf`, `*.ppt`, `*.pptx`, `*.zip`, `*.docx` — configurável em `defineConfig()`.

---

## 2B: Agent Executor

### Problema

O `project-manager` Python executa agentes mas envia todo o conteúdo do projeto como contexto → estouro de tokens. Precisa de guardrail e controle de timeout.

### Solução

`src/pm/executor.ts` que chama `claude --print` com:
- Truncagem de contexto (`MAX_CONTEXT_CHARS`)
- Timeout configurável
- Parse do output para extrair `RESULTADO:`

### Módulos

```
src/
  pm/
    executor.ts     ← runAgent(task, opts) → AgentResult
    prompt.ts       ← buildPrompt(directives, project, maxChars)
```

### Interface

```typescript
interface ExecutorOptions {
  maxContextChars?: number   // default: 8000
  timeoutMs?: number         // default: 120_000 (2min)
  permissionMode?: string    // default: "bypassPermissions"
}

async function runAgent(
  agent: VaultAgent,
  project: VaultProject,
  opts?: ExecutorOptions,
): Promise<AgentResult>

interface AgentResult {
  success: boolean
  output: string
  resultado?: string    // linha "RESULTADO: ..." extraída do output
  durationMs: number
  error?: string
}
```

### CLI

```bash
taverna run @study-assistant --project PSI3451
taverna run @planner --dry-run   # mostra prompt sem executar
taverna execute                  # roda agentes em todos os projetos elegíveis
```

### Critério de elegibilidade para `execute`

Um projeto é elegível se:
- Tem `agent:` no frontmatter
- `run_every` está configurado (não `never`)
- Tempo desde `_last_run` >= frequência definida

### Testes

- `buildPrompt` trunca em `maxContextChars`
- `buildPrompt` inclui diretivas + ID do projeto + conteúdo
- `runAgent` com `--dry-run` retorna o prompt sem subprocess
- Parse de `RESULTADO:` extrai linha correta

---

## Prioridade

**2A (assets)** é independente do executor — pode ser feita primeiro se PSI3451 for urgente.  
**2B (executor)** substitui o Python `executor.py` e permite desligar o timer systemd do Python.

## Dependências novas esperadas

Nenhuma para 2B (só Node.js nativo + `tsx`).  
Para 2A: nenhuma (SHA-256 via `node:crypto`).
