---
id: 7-spec-schedule-engine
title: 'Spec: motor de cronograma (schedule engine)'
status: "🧠"
project: taverna
progresso: 0
---

Hoje o taverna sabe responder "em que estado este item está" (`core/flow/`) mas
não "em que ordem as coisas devem acontecer" nem "o que está atrasando o todo".
`depends` existe como campo estrutural (`VaultTask`/`VaultProject`,
`src/vault/SPEC.md`) mas é puro passthrough — ninguém o interpreta como grafo.

Esta spec propõe uma nova dimensão no core: um motor que lê `depends` como um
DAG e calcula caminhos/ordens/folgas sobre ele — dando, de graça, uma resposta
genérica ao problema de progresso ("onde estou no caminho, o que tenho de
folga, o que é gargalo"), e uma base sobre a qual plugins podem resolver
problemas de otimização (custo, alocação de recursos, problemas tipo *traveling
salesman*) sem reimplementar a leitura do grafo.

---

## Por que um módulo novo, não uma extensão do `flow/`

`flow/` responde "que transições de **status** são válidas a partir daqui" —
um grafo de **estados**, definido pelo usuário em `.canvas`. Cronograma
responde "em que ordem os **itens** (tasks/projetos) devem ser feitos dado
quem depende de quem" — um grafo de **itens**, definido por `depends` na
frontmatter de cada um. São dois grafos diferentes sobre universos diferentes;
tratá-los como a mesma coisa acoplaria dois conceitos que evoluem
independentemente (o usuário pode mudar seu fluxo de status sem jamais tocar
em dependências entre tasks, e vice-versa).

`core/schedule/` é proposto como módulo-irmão de `core/flow/`, seguindo o
mesmo padrão de organização (spec 1, "Command groups").

---

## O que o motor calcula (mecanismo, não política)

Dado um conjunto de itens com `depends: string[]`:

1. **Construção do grafo** — `buildGraph(items)`: monta o DAG a partir de
   `depends`; detecta e rejeita ciclos (um cronograma com ciclo é
   contraditório por definição — assim como `flow/` rejeita transições para
   estados desconhecidos).
2. **Ordenação topológica** — a sequência em que os itens *podem* ser
   feitos respeitando dependências.
3. **Caminho crítico (CPM)** — passada para frente e para trás sobre o grafo
   ponderado: *earliest/latest start/finish* por nó, e a partir disso **slack
   (folga)** e o(s) **caminho(s) crítico(s)** (folga zero). Isso é o que
   endereça progresso de forma genérica: um item com folga zero que está
   atrasado atrasa o todo; um item com folga grande não é urgente — sem que o
   core precise saber o que "urgente" significa para o usuário.

`get_schedule_state` seria o equivalente, em cronograma, ao `getFlowState` do
`flow/`: dado um item, retorna sua posição no grafo (predecessores, sucessores,
folga, se está no caminho crítico) — a base para um cliente construir "o que
isso está bloqueando / o que está bloqueando isso".

---

## O ponto central de design: peso é resolvido por fora, não pelo core

O CPM precisa de um peso (duração/esforço estimado) por nó. O core **não pode
saber** se isso é `estimate`, `effort`, uma diferença de datas, ou uma
inferência por escopo qualquer — isso é tão específico da vault do usuário
quanto os `infer` chains do `flow/` (`core/flow/SPEC.md`, "O engine é
intencionalmente silencioso sobre quais escopos existem").

Proposta: o motor recebe um **resolvedor de peso** como parâmetro —
`(item) => number` — fornecido pelo chamador (comando core, plugin, ou
derivado de configuração de fluxo). O motor em si não tem opinião sobre o que
"duração" significa; ele só sabe propagar pesos por um grafo. Isso preserva a
garantia central do projeto — "specs stay abstract" (`SPEC.md`, "Evolution
notes") — e mantém o motor reutilizável por qualquer vault, qualquer
convenção de estimativa.

Esse é, de longe, o ponto mais delicado desta spec: genérico demais
(`weight: number` cru, sem convenção nenhuma) e o motor vira um wrapper fino de
baixo valor; específico demais (assumir calendário, feriados, dias úteis) e
quebra a promessa de que o core nunca conhece a vault. Resolver isso por um
resolvedor plugável — espelhando o pipeline `infer → default → prompt` do
`flow/` — é a aposta desta spec, mas deveria ser validado contra um fluxo real
antes de virar contrato fixado (`CommandDef`/evento são caros de mudar depois).

---

## Comandos propostos (grupo: cronograma)

### `get_schedule`
Calcula o cronograma de um projeto (ou de um subconjunto de itens): ordenação
topológica, caminho crítico, folga por item.
- params: `projectId*`
- retorna: `{ order: string[], criticalPath: string[], items: { id, earliestStart, latestStart, slack }[] }`

### `get_schedule_state`
Equivalente, em cronograma, ao `get_flow_state`: posição de um item no grafo.
- params: `projectId*`, `taskId?`
- retorna: `{ predecessors: string[], successors: string[], slack: number, onCriticalPath: boolean }`

(Nomes e formatos exatos a refinar na implementação — o que importa aqui é a
forma do contrato: leitura pura, sem mutação, espelhando `get_flow`/
`get_flow_state`.)

---

## Eventos

Sempre que o grafo de um projeto muda — uma task nova com `depends`, uma
mudança em `depends`, conclusão de um item — o motor publica
`core.schedule.recomputed` no `NotificationBus` (`notifications/SPEC.md`),
seguindo a mesma convenção `<origin>.<entity>.<action>` de `core.task.moved`/
`core.project.moved`. Isso é o que permite que dashboards e plugins reajam a
mudanças de cronograma sem precisar fazer polling.

---

## O que NÃO é responsabilidade deste motor

Uma vez que o core devolve o grafo com pesos resolvidos e o caminho crítico,
ele já resolveu progresso ("onde estou, o que está travando") sem qualquer
noção de custo ou otimização. O resto é, deliberadamente, problema de plugin:

- **Custo e orçamento** — atribuir custo a nós/arestas e agregá-lo é
  específico de cada comunidade (e já consta como fora do core em
  `tasks/3-spec-config.md` e `tasks/1-spec-core-commands.md`).
- **Otimização combinatória** — reordenar para minimizar custo total, alocar
  recursos limitados, problemas estruturalmente equivalentes a *traveling
  salesman* — aparecem em domínios completamente diferentes (alocação de
  agentes, escalonamento de pessoas, roteamento de entregas) e cada um traz
  sua própria função-objetivo. O core fornece o grafo consistente
  (sem ciclos, com ordem topológica e pesos resolvidos); o plugin traz o
  algoritmo de otimização e o que ele está otimizando para.
- **Calendários, dias úteis, feriados** — se algum dia entrarem, entram como
  parte do resolvedor de peso fornecido externamente, nunca como conhecimento
  do motor.

---

## Evolution notes

- **Nunca acoplar peso a uma convenção fixa de frontmatter.** Se em algum
  momento o motor passar a *assumir* que duração vem de um campo chamado
  `estimate` (ou qualquer outro), pare — isso é o mesmo erro que `vault/SPEC.md`
  alerta contra ("se você se pega adicionando um campo específico de vault
  aqui, é sinal de que pertence a um plugin").
- **Detecção de ciclo é inegociável.** Um DAG com ciclo não tem ordenação
  topológica nem caminho crítico — o motor deve falhar de forma explícita e
  atômica, no mesmo espírito do `transition()` do `flow/` ("nada é escrito" se
  algo está inconsistente).
- **Este módulo é leitura pura.** Ele não escreve em frontmatter, não move
  itens, não decide nada — apenas projeta o grafo de `depends` e responde
  perguntas sobre ele. Qualquer mutação (ex.: replanejar datas) seria um
  comando separado, construído sobre ele, não parte dele.
- Caso o pipeline de resolução de peso cresça em complexidade, o paralelo
  natural é o `resolve.ts` do `flow/` — vale revisar se o mesmo
  `infer → default → prompt` se aplica, ou se cronograma precisa de uma forma
  própria (ex.: `infer` de duração por tipo de task).
