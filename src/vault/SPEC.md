# vault — spec

Reads and writes the Obsidian vault. This module owns *all* filesystem access
to vault content — frontmatter parsing, folder scanning, file scaffolding. For
the file-by-file map and the expected on-disk layout, see [`README.md`](README.md);
this document is the contract: what guarantees this module makes, and what it
deliberately refuses to know.

## The core guarantee: the vault is content, not schema

`taverna` interprets frontmatter and folder structure *generically*. It does
not know what a "type" of project is, what `status` values are valid, what
custom frontmatter fields mean, or how a task should be prioritized. All of
that is either:
- **passthrough** — preserved verbatim in `raw: RawFrontmatter` so plugins and
  the flow engine can read whatever they need without this module having to
  know about it in advance, or
- **delegated** — `status` validity and transitions are entirely owned by the
  canvas-driven flow engine (`core/flow/`), not by an enum here.

This is what keeps taverna distributable across vaults with completely
different conventions (see `[[feedback-taverna-spec]]` and the root spec's
"specs stay abstract" note). If you find yourself adding a vault-specific
field or a fixed set of valid values here, that's a sign it belongs in a
plugin or in the user's own configuration instead.

## What this module reads

`VaultProject` / `VaultTask` / `InboxItem` (`types.ts`) carry only the fields
that are structurally meaningful to the core (`id`, `filePath`, `title`,
`progresso`, `status`, `depends`, `body`) plus `raw` — the full parsed
frontmatter, untouched. Anything a plugin or flow needs beyond the structural
fields comes from `raw`.

`progresso` is normalized to `0..100` by `getProgress` (`frontmatter.ts`),
accepting numeric, percentage-string, or bare-number-string forms — this is
the one piece of light normalization the module performs, because `progresso`
drives task ordering/filtering generically across the whole core.

## What this module writes

Writes are narrow and structural — they never touch arbitrary frontmatter:

- `scaffoldProject` creates a project's folder skeleton (`tasks/`,
  `tasks/archive/`, a minimal `README.md` with just `id:` in frontmatter).
  Idempotent: an existing project folder is reported, not overwritten.
- `writeTaskFile` creates a new numbered, slugified task file
  (`<n>-<slug>.md`) with whatever frontmatter the caller supplies — the module
  decides the filename and numbering scheme, the caller decides the content.

Anything beyond folder/file creation — setting `status`, resolving required
fields, moving a task to archive — is **not** this module's job; it's the flow
engine's (`move_*`) or the task-commands' (`archive_task`). This module is the
filesystem primitive layer; orchestration lives one level up in `core/`.

## Backlinks

`findBacklinks` walks every `.md` file in the vault and matches both wikilinks
(`[[Note]]`, `[[Note|alias]]`, `[[Note#heading]]`) and Markdown links
(`[text](path.md)`) against a note's stem and vault-relative path, returning
`{ source, line }[]` (1-based line numbers). This is a full vault scan — there
is no index. If backlink lookups become a bottleneck, caching belongs in the
caller (or a plugin), not here: this module stays a thin, stateless read layer.

## Evolution notes

- New structural fields on `VaultProject`/`VaultTask` should only be added if
  they're meaningful to *every* vault, regardless of the user's flow/plugin
  setup — otherwise they belong in `raw` passthrough.
- Keep writes minimal and structural. If a new command needs to mutate
  frontmatter in a flow-aware way, it almost certainly belongs in `core/flow/`
  or alongside `task-commands.ts`, reusing this module's primitives
  (`writeTaskFile`, `scaffoldProject`, `parseFrontmatter`) rather than growing
  new write paths here.
- `00_Inbox/` and the `<id>/README.md` (with `<id>.md` as legacy fallback)
  conventions are documented in `README.md` — changing them is a vault-layout
  migration, not a code change, and should be reflected there first.
