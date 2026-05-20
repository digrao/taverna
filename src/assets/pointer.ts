// Node.js I/O layer — re-exports core + adds file read/write.
export * from './pointer.core.js'

import { readFile, writeFile } from 'node:fs/promises'
import { parsePointer, formatPointer } from './pointer.core.js'
import type { AssetPointer } from './pointer.core.js'

export async function readPointer(filePath: string): Promise<AssetPointer> {
  return parsePointer(await readFile(filePath, 'utf8'))
}

export async function writePointer(filePath: string, p: AssetPointer): Promise<void> {
  await writeFile(filePath, formatPointer(p), 'utf8')
}
