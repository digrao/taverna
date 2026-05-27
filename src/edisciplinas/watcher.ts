import { watch } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveDisciplineFromMetadata, syncAssets } from './registry.js'

const METADATA_FILENAME = '_edisciplinas_metadata.json'
const DEBOUNCE_MS = 500

export function startEdisciplinasWatcher(
  vaultPath: string,
  onSync: (disciplineId: string) => void,
  downloadsDir?: string,
): () => void {
  const dir = downloadsDir ?? join(homedir(), 'Downloads')
  const metadataPath = join(dir, METADATA_FILENAME)

  let debounce: ReturnType<typeof setTimeout> | null = null

  let watcher: ReturnType<typeof watch>
  try {
    watcher = watch(dir, (event, filename) => {
      if (filename !== METADATA_FILENAME) return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        void (async () => {
          const disciplineId = await resolveDisciplineFromMetadata(metadataPath, vaultPath)
          if (!disciplineId) return
          await syncAssets(disciplineId, vaultPath, dir)
          onSync(disciplineId)
        })()
      }, DEBOUNCE_MS)
    })
  } catch {
    return () => {}
  }

  return () => watcher.close()
}
