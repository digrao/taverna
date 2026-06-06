---
id: 6-spec-changelog-wiki
title: "Spec: changelog e wiki por versão"
status: 🗺️
project: taverna
progresso: 0
---

Definir como o taverna mantém e processa o CHANGELOG para atualizar a wiki a cada versão.

## CHANGELOG

- Formato: [Keep a Changelog](https://keepachangelog.com) com seções `Added`, `Changed`, `Fixed`, `Removed`
- Uma seção por versão semântica (`## [x.y.z] — YYYY-MM-DD`)
- `[unreleased]` é a seção de trabalho — vira uma versão ao fazer release

## Wiki

- A wiki é um submodule em `wiki/` apontando para `taverna.wiki.git`
- Cada página da wiki tem uma seção `## Changelog` gerada automaticamente a partir do CHANGELOG.md
- O processamento é feito pelo comando `taverna release <version>`:
  1. Renomeia `[unreleased]` → `[version] — date`
  2. Extrai as entradas relevantes de cada seção e atualiza as páginas da wiki correspondentes
  3. Comita wiki e repo com a tag da versão

## Mapeamento CHANGELOG → wiki

| Seção CHANGELOG | Páginas da wiki afetadas |
|---|---|
| core commands | CLI-Reference, HTTP-API |
| plugin interface | Plugin-System |
| template language | Template-Language |
| config | Getting-Started |
| notification bus | Plugin-System |

## Comando core

`release` não é um comando core — é uma operação de desenvolvimento. Candidato a script ou plugin `taverna-release`.
