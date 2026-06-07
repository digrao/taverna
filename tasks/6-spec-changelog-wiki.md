---
id: 6-spec-changelog-wiki
title: 'Spec: changelog e wiki por versão'
status: "\U0001F3D6️"
project: taverna
progresso: 100
---

Definir como o taverna mantém o CHANGELOG e propaga mudanças para a wiki a cada release.

---

## CHANGELOG

Formato [Keep a Changelog](https://keepachangelog.com). Cada entrada carrega uma tag entre colchetes que determina quais páginas da wiki ela atualiza:

```markdown
## [unreleased]

### Added
- [plugin-interface] Namespace auto-derivado do `name` do plugin
- [commands] Comandos core: `get_projects`, `get_project`, `get_inbox`
- [config] `taverna.config.json` com schema autodocumentado

### Changed
- [protocols] MCP suporta stdio e HTTP SSE — cliente escolhe o transport
```

Tags são livres — quem define o significado são as páginas da wiki (ver abaixo).

---

## Wiki

Cada página da wiki declara no frontmatter quais tags do CHANGELOG ela absorve:

```markdown
---
changelog-tags:
  - plugin-interface
  - commands
---

# Plugin System

...conteúdo...

## Changelog

<!-- gerado por taverna release — não editar manualmente -->
```

O bloco `## Changelog` é gerenciado pelo release — o resto da página é editado normalmente. O mapeamento é **self-documenting**: adicionar uma nova página à wiki com `changelog-tags` é suficiente para que ela passe a receber entradas automaticamente.

---

## `taverna release`

Comando de desenvolvimento (não core, não plugin) — incluso no binário como utilitário de manutenção, igual ao `create-plugin`.

```bash
taverna release 1.0.0
```

Fluxo:

1. Valida que `[unreleased]` tem entradas
2. Renomeia `[unreleased]` → `[1.0.0] — YYYY-MM-DD` no CHANGELOG
3. Para cada página da wiki com `changelog-tags`:
   - Coleta entradas do CHANGELOG que batem alguma das tags da página
   - Substitui o bloco `## Changelog` com as entradas coletadas, agrupadas por versão
4. Comita a wiki (`wiki/`) com a mensagem `release: 1.0.0`
5. Comita o repo principal com a mesma mensagem e cria a tag `v1.0.0`

---

## Páginas da wiki e suas tags

| Página | `changelog-tags` |
|---|---|
| `Plugin-System.md` | `plugin-interface`, `notification-bus` |
| `CLI-Reference.md` | `commands`, `protocols` |
| `HTTP-API.md` | `commands`, `protocols` |
| `Template-Language.md` | `template-language` |
| `Getting-Started.md` | `config`, `protocols` |

Essa tabela é apenas referência — a fonte de verdade são os frontmatters das páginas.
