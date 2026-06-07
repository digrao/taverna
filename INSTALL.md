# Instalando o taverna

## Pré-requisitos

- [Node.js](https://nodejs.org) 20 ou superior
- Uma vault do [Obsidian](https://obsidian.md) (ou qualquer pasta organizada
  como uma — o `taverna` não depende do app, apenas do formato dos arquivos)

## 1. Instalação

### Via npm (recomendado para uso normal)

```bash
npm install -g taverna
taverna --version
```

### A partir do código-fonte (para desenvolvimento)

```bash
git clone https://github.com/digrao/taverna.git
cd taverna
npm install
npm run build
npm link          # disponibiliza `taverna` globalmente, apontando para dist/
```

### Via Docker

Veja a seção [Docker](#docker) abaixo — útil se você quer rodar o `taverna
serve` (servidor HTTP) como um serviço, sem instalar Node localmente.

## 2. Configuração

O `taverna` localiza primeiro o **arquivo de configuração** — é ele quem diz
onde está a vault, nunca o contrário. Por padrão, ele procura em
`~/.config/taverna/config.json` (substituível com `--config <caminho>`).

```bash
mkdir -p ~/.config/taverna
cat > ~/.config/taverna/config.json <<'EOF'
{
  "vaultPath": "/caminho/absoluto/para/sua/vault",
  "projectsDir": "10_Projects",
  "flowDir": "20_Areas/2_Fluxos",
  "port": 3861,
  "plugins": []
}
EOF
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `vaultPath` | sim | Caminho absoluto para a raiz da vault |
| `projectsDir` | sim | Pasta de projetos, relativa a `vaultPath` |
| `flowDir` | sim | Pasta com os canvases de fluxo e seus schemas de nó |
| `port` | não | Porta do servidor HTTP (`taverna serve`) — padrão `3861` |
| `plugins` | não | Lista de `{ "path": "...", "enabled": true }` — veja [CONTRIBUTING.md](CONTRIBUTING.md#escrevendo-um-plugin) |

## 3. Estrutura esperada da vault

O `taverna` é deliberadamente pouco exigente — ele lê frontmatter e estrutura
de pastas, e preserva qualquer campo que não reconheça. O mínimo necessário:

```
<vaultPath>/
├── 10_Projects/                  # projectsDir
│   └── meu-projeto/
│       ├── README.md             # frontmatter: id, status, ...
│       └── tasks/
│           ├── 1-minha-task.md   # frontmatter: status, progresso, ...
│           └── archive/
├── 00_Inbox/                     # itens soltos a triar
└── 20_Areas/2_Fluxos/            # flowDir
    ├── task.canvas               # estados/transições de uma task
    ├── project.canvas            # estados/transições de um projeto
    └── nodes/
        ├── <id-do-nó-1>.md       # schema do estado: status, required, default, infer
        └── <id-do-nó-2>.md
```

Um projeto é uma pasta com `README.md` (ou `<id>.md`, como fallback legado)
contendo pelo menos `id` no frontmatter; `status` é o que conduz seu projeto
pelo fluxo de `project.canvas`. O mesmo vale para tasks e `task.canvas`.

### Seu primeiro fluxo

Um fluxo é um arquivo `.canvas` do Obsidian (JSON de nós e arestas). Uma
aresta vira uma transição válida; um nó vira um **estado** se — e somente se —
existir um arquivo `nodes/<id-do-nó-no-canvas>.md` com a seguinte forma:

```yaml
---
status: <identificador do estado>     # ex.: um emoji, ou qualquer string que você queira
required: [campo, ...]                # campos exigidos para entrar neste estado
default:
  campo: "modelo de texto"             # ver wiki/Template-Language.md
infer:
  campo: "escopo > escopo > ..."       # de onde herdar o valor, em ordem de prioridade
---
```

Ao mover uma task/projeto para esse estado (`move_task`/`move_project`), o
`taverna` resolve cada campo `required` na ordem: já preenchido → `infer` →
`default` → pergunta interativa (CLI) — e só escreve a transição se **todos**
os campos forem resolvidos. Veja `tasks/0-guia-canvas.md` na vault de
referência e `wiki/Template-Language.md` para a sintaxe completa de templates.

> Não existe fluxo "padrão" embutido — desenhar o canvas é o primeiro passo
> real de configuração. Comece simples (dois ou três estados) e evolua.

## 4. Primeira execução

```bash
taverna get_projects        # lista os projetos da vault
taverna get_inbox           # itens pendentes de triagem
taverna get_flow --flow task   # mostra os estados/transições do seu fluxo
```

Se tudo isso responder sem erro, a configuração está correta.

## 5. Subindo os adaptadores de protocolo

```bash
taverna serve     # servidor HTTP em http://localhost:<port>
                  #   GET  /api/config/schema   — schema de todos os comandos
                  #   GET|POST /api/<id>        — comandos do core
                  #   GET  /events              — stream SSE do barramento de notificações
                  #   GET  /mcp/sse  POST /mcp/message — MCP sobre HTTP

taverna mcp       # servidor MCP via stdio — exposto como ferramentas taverna_<id>
```

Para conectar um cliente MCP (ex. Claude Desktop/Code) via stdio, aponte-o
para o binário `taverna mcp`; para conectar via HTTP/SSE, use
`http://localhost:<port>/mcp/sse`.

## Docker

O repositório inclui um `Dockerfile` que builda e empacota o `taverna` para
rodar `taverna serve`. A vault e o arquivo de configuração são montados como
volumes — o container nunca contém dados da sua vault.

```bash
docker build -t taverna .

docker run -d \
  --name taverna \
  -p 3861:3861 \
  -v /caminho/absoluto/para/sua/vault:/vault:ro \
  -v $HOME/.config/taverna/config.json:/config/config.json:ro \
  taverna
```

Pontos de atenção:
- `vaultPath` no `config.json` montado deve apontar para `/vault` (o caminho
  *dentro* do container), não para o caminho no host.
- O volume da vault está montado como somente-leitura (`:ro`) no exemplo
  acima; remova o `:ro` se quiser que o `taverna` também escreva (criar
  projetos/tasks, mover estados, etc.).
- A imagem expõe a porta `3861` por padrão — ajuste `-p` e `port` no config
  juntos se quiser outra.

Veja também o `docker-compose.yaml` incluído — ele já encapsula esses dois
volumes e a porta. Edite os dois caminhos de volume para apontar para a sua
vault e o seu `config.json` (o `taverna` não usa variáveis de ambiente para
isso — é o mesmo princípio do bootstrap por arquivo único descrito acima) e
suba com:

```bash
docker compose up -d
```

## Solução de problemas

- **`Config not found at ~/.config/taverna/config.json`** — crie o arquivo
  (passo 2) ou passe `--config <caminho>` explicitamente.
- **`Config at ... is missing required field "..."`** — confira se
  `vaultPath`, `projectsDir` e `flowDir` estão todos presentes.
- **Um comando `move_*` falha dizendo que faltam campos** — é o
  comportamento esperado: a transição é atômica e só acontece se *todos* os
  campos `required` do estado de destino forem resolvidos. Rode pelo CLI
  (que pode perguntar interativamente) ou preencha o campo manualmente no
  frontmatter antes de mover.
- **Plugins não carregam** — o loader é fail-safe: um plugin com erro é
  registrado no `stderr` e ignorado, sem derrubar o core. Olhe a saída de
  `taverna serve`/`taverna mcp` para a mensagem `[plugin] failed to load ...`.
