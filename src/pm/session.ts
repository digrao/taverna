import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import matter from 'gray-matter'
import type { VaultTask } from '../vault/types.js'

export interface SessionSpec {
  session_id: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  project: string
  agent: string
  tasks: string[]
  _session_started: string
}

export function buildLogtaskContent(spec: SessionSpec, tasks: VaultTask[]): string {
  const taskList = tasks
    .map((t) => `- [ ] Task ${t.id}: ${t.title}\n  _file: ${t.filePath}_`)
    .join('\n')

  const body = [
    '',
    '# Sessão de Automação Coletiva (Logtask)',
    '',
    'O agente deve executar as seguintes tarefas em sequência nesta mesma sessão, aproveitando o cache de leitura dos arquivos:',
    '',
    taskList,
    '',
  ].join('\n')

  return matter.stringify(body, {
    session_id: spec.session_id,
    status: spec.status,
    project: spec.project,
    agent: spec.agent,
    tasks: spec.tasks,
    _session_started: spec._session_started,
  })
}

export async function writeLogtaskFile(spec: SessionSpec, tasks: VaultTask[]): Promise<string> {
  const dir = join(tmpdir(), 'taverna-sessions')
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, `${spec.session_id}.logtask.md`)
  await writeFile(filePath, buildLogtaskContent(spec, tasks), 'utf8')
  return filePath
}
