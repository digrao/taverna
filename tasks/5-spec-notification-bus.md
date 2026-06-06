---
id: 5-spec-notification-bus
title: "Spec: bus de notificações"
status: 🗺️
project: taverna
progresso: 0
---

Definir o bus de eventos interno do taverna.

Requisitos:
- publicar eventos quando ações relevantes acontecem (run iniciado, task concluída, erro, etc.)
- plugins podem se inscrever e publicar eventos
- suporte inicial: Matrix (via neo-matrix)
- transporte plugável — não acoplar ao Matrix no core
