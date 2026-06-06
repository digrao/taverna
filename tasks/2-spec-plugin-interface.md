---
id: 2-spec-plugin-interface
title: "Spec: interface de plugins"
status: 🗺️
project: taverna
progresso: 0
---

Definir o contrato que um plugin deve implementar para estender o taverna.

Um plugin pode:
- adicionar comandos core
- registrar rotas HTTP
- registrar ferramentas MCP
- registrar subcomandos CLI
- adicionar comportamento de scheduling

A interface deve ser agnóstica de linguagem no que for possível.
