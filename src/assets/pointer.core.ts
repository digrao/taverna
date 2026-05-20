// Pure, environment-agnostic module — shared between taverna CLI and Obsidian plugin.
// No Node.js imports allowed here.

export const ASSET_MARKER = 'taverna-asset-v1'

export const DEFAULT_ASSET_EXTENSIONS = ['pdf', 'ppt', 'pptx', 'zip', 'docx', 'mat', 'vhd']

export interface AssetPointer {
  name: string
  sha256: string
  size: number
  copyparty?: string
  gdrive?: string
}

export function parsePointer(content: string): AssetPointer {
  const lines = content.trim().split('\n')
  if (lines[0]?.trim() !== ASSET_MARKER) {
    throw new Error(`Invalid asset pointer: expected "${ASSET_MARKER}" on first line`)
  }
  const fields: Record<string, string> = {}
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  const { name, sha256, size } = fields
  if (!name || !sha256 || !size) {
    throw new Error('Asset pointer missing required fields: name, sha256, size')
  }
  return {
    name,
    sha256,
    size: Number(size),
    ...(fields['copyparty'] ? { copyparty: fields['copyparty'] } : {}),
    ...(fields['gdrive'] ? { gdrive: fields['gdrive'] } : {}),
  }
}

export function formatPointer(p: AssetPointer): string {
  const lines = [ASSET_MARKER, `name: ${p.name}`, `sha256: ${p.sha256}`, `size: ${p.size}`]
  if (p.copyparty) lines.push(`copyparty: ${p.copyparty}`)
  if (p.gdrive) lines.push(`gdrive: ${p.gdrive}`)
  return lines.join('\n') + '\n'
}

export function fmtSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}
