---
id: 8-conceitos-centrais-taverna-como-escalonador-de-lif
title: 'Conceitos centrais: taverna como escalonador de Life OS'
status: 🧠
project: taverna
---

# Conceitos centrais: taverna como escalonador de Life OS

## Visão geral

O taverna é um escalonador de tarefas inspirado no scheduler de um SO multicore. Em vez de processos e núcleos de silício, temos **tarefas** e **executores** (cores). O dispatcher decide o que vai para quem.

---

## Os quatro pilares

### 1. Core (executor)

Um core tem **capacidade limitada**:

- **Pessoa** → horas disponíveis por dia
- **Agente de IA** → número de tarefas paralelas processáveis

O tipo do core determina o modelo de execução (ver abaixo).

### 2. Task (tarefa)

Cada tarefa carrega:

| Campo | Descrição |
|---|---|
| `body` | Descrição do que precisa ser feito |
| `estimate` | Esforço esperado (tempo ou pontos) |
| `priority` | Peso para o dispatcher |
| `depende` | Tarefas que precisam concluir antes |
| `status` | Estado atual no fluxo (canvas-driven) |

**Ciclo de estados:** fila → atribuída → em progresso → bloqueada → concluída

### 3. Dispatcher (escalonador)

Decide `task → core` levando em conta:

- Prioridade da tarefa
- Dependências satisfeitas
- Capacidade restante do core

É o mesmo problema que um SO resolve a cada tick — só que aqui o "tick" é o momento em que um core fica disponível.

### 4. Modelo de execução

| Tipo de core | Modelo | O que o sistema faz |
|---|---|---|
| Pessoa | **Passivo** | Cria bloco de agenda, envia lembrete via Matrix, aguarda ação humana |
| Agente de IA | **Ativo** | Dispara job, entrega o `body` da task ao agente, aguarda resultado — sem interação humana |

---

## Integrações

### Calendário

- Mapeia `estimate` nos blocos livres da agenda
- Divide tarefas maiores em sessões se necessário
- Reagenda automaticamente se um lembrete for ignorado (evita deadlock de fila)

### Bus de notificações + Matrix bot

- O bus encaminha eventos de dependência e mudança de estado
- O bot envia mensagens periódicas colapsando as opções ("o que você deve fazer agora")
- Respostas em tempo real via Matrix atualizam o estado das tarefas

### Políticas adaptativas

- Arquivo de políticas define priorização por contexto atual
- Feedback via timestamps reais substitui estimativas fixas: o sistema aprende o ritmo do executor

### Rotina semanal

- O bot compila relatório: concluído / pendente / atrasado
- Usuário decide: reagendar, cancelar ou manter
- Mantém a fila limpa e realista, evitando acúmulo ansioso

---

## Arquitetura de plugins

O core cuida do scheduling; a periferia (Matrix, calendário, agentes de IA) entra via plugins. Cada plugin declara seus comandos e o taverna os expõe nos três protocolos (HTTP, MCP, CLI).

---

## MVP

O sistema já está na v1.0 (após ~9 iterações). A prioridade agora é **começar a aplicar imediatamente na menor escala possível** — construir o Life OS um dia de cada vez, sem abrir mão das prioridades em curso. Complexidade cresce junto com o uso real, não antes dele.
