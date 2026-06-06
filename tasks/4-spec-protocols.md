---
id: 4-spec-protocols
title: "Spec: adaptadores de protocolo (HTTP, MCP, CLI)"
status: 🗺️
project: taverna
progresso: 0
---

Definir como os comandos core são expostos via cada protocolo.

Para cada protocolo (HTTP, MCP, CLI):
- como um comando core é mapeado
- como parâmetros são recebidos e validados
- como erros são reportados
- o que é específico do protocolo vs o que é responsabilidade do core

Os adaptadores não devem conter lógica de negócio.
