# taverna

> *Vontade é a condição necessária e suficiente para fazer a realidade.*

Um orquestrador headless e agnóstico de protocolo sobre uma vault do
[Obsidian](https://obsidian.md). O `taverna` lê projetos, tasks e uma inbox a
partir de frontmatter e estrutura de pastas em Markdown puro, conduz máquinas
de estado a partir dos seus próprios arquivos de Canvas do Obsidian, e expõe
tudo isso — de forma idêntica — via **CLI**, **HTTP** e **MCP**.

Ele não embute opiniões sobre o que é um "projeto" ou uma "task" além de uma
forma genérica e enxuta. Os estados pelos quais uma task passa, os campos que
cada estado exige, como esses campos são preenchidos — tudo isso é
configuração **sua**, escrita como arquivos `.canvas` e pequenos schemas em
Markdown, nunca codificada de forma fixa. Qualquer coisa mais específica
(execução de agentes, integrações de chat, dashboards, …) é um
[plugin](CONTRIBUTING.md#escrevendo-um-plugin).

## Por quê

A maioria das ferramentas de conhecimento pessoal / orquestração de tarefas
força você a entrar no modelo *delas* de ciclo de vida de projeto. O
`taverna` inverte isso: você desenha seu fluxo como um canvas no Obsidian — a
ferramenta onde você provavelmente já guarda suas notas — e o `taverna`
transforma isso numa máquina de estados de verdade que conduz sua vault. O
mesmo mecanismo funciona seja seu fluxo com três estados ou trinta, seja para
tasks de software, um pipeline de escrita, ou qualquer outra coisa.

## Quickstart

```bash
mkdir -p ~/.config/taverna
```

`~/.config/taverna/config.json`:
```json
{
  "vaultPath": "/caminho/para/sua/vault",
  "projectsDir": "10_Projects",
  "flowDir": "20_Areas/2_Fluxos",
  "plugins": []
}
```

```bash
taverna get_projects
```

Veja [INSTALL.md](INSTALL.md) para o guia completo de instalação (incluindo
Docker), o layout esperado da vault, e como escrever seu primeiro canvas de
fluxo.

## Como é exposto

Todo comando — do core ou de plugin — é publicado de forma idêntica nos três
protocolos, derivado puramente do seu id e (no caso de plugins) do seu
namespace:

| Origem | HTTP | MCP | CLI |
|---|---|---|---|
| core | `GET\|POST /api/<id>` | `taverna_<id>` | `taverna <id>` |
| plugin | `GET\|POST /api/<namespace>/<id>` | `taverna_<namespace>_<id>` | `taverna <namespace> <id>` |

```bash
taverna get_flow --flow task                  # CLI
curl localhost:3861/api/get_flow?flow=task    # HTTP
taverna mcp                                   # MCP via stdio — tool taverna_get_flow
```

## Documentação

- [INSTALL.md](INSTALL.md) — instalação, configuração, Docker, primeiros passos
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup de desenvolvimento, layout do projeto, como escrever plugins
- [SPEC.md](SPEC.md) — referência de arquitetura as-built, módulo a módulo

## Licença

[MIT](LICENSE) © João Victor Cavalcante Miranda

## Comunidade

![Matrix](https://img.shields.io/matrix/taverna:matrix.jvcm.com.br?logo=matrix)

Se off, talvez alguém tenha tropeçado em algum fio aqui...
(Se tem aviso, tem história)