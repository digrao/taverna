import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { VaultAgent, VaultProject } from '../vault/types.js'

export interface ResolvedPolicy {
  permissionMode: 'bypassPermissions' | 'default'
  allowedTools: string[] | undefined
  // Source breakdown — useful for `taverna policy` display
  agentTools: string[]
  inferredTools: string[]
  inferredFrom?: string // resolved path that originated the inference
}

/**
 * Infers allowedTools from the project's `target` field.
 * Only called when the agent already has explicit permissions (default mode).
 * Grants Write/Edit/Read + git ops if the target is a git repo.
 */
export function inferProjectTools(workspaceDir: string | undefined): {
  tools: string[]
  resolvedPath?: string
} {
  if (!workspaceDir) return { tools: [] }
  const home = process.env['HOME'] ?? `/home/${process.env['USER'] ?? 'user'}`
  const path = workspaceDir.replace(/^~/, home)
  if (!existsSync(path)) return { tools: [] }

  const tools = ['Write', 'Edit', 'Read']
  if (existsSync(join(path, '.git'))) {
    tools.push(
      'Bash(git add *)',
      'Bash(git commit *)',
      'Bash(git diff *)',
      'Bash(git log *)',
      'Bash(git status)',
      'Bash(git push *)',
    )
  }
  return { tools, resolvedPath: path }
}

/**
 * Resolves the effective permission policy for an agent+project pair.
 *
 * Scope chain (additive):
 *   agent directive permissions  →  inferred from project target
 *
 * If the agent has no explicit permissions, bypassPermissions stays in effect
 * (no restriction applied). Inference only kicks in when the agent already
 * operates in default mode, to avoid narrowing an already-open policy.
 */
export function resolvePolicy(agent: VaultAgent, project: VaultProject): ResolvedPolicy {
  const agentTools = agent.permissions ?? []
  // Only infer when agent has explicit permissions — otherwise bypassPermissions
  // is already in effect and inference would make things more restrictive.
  if (agent.permissions === undefined) {
    return {
      permissionMode: 'bypassPermissions',
      allowedTools: undefined,
      agentTools: [],
      inferredTools: [],
    }
  }

  const { tools: inferredTools, resolvedPath } = inferProjectTools(project.workspaceDir)
  const allTools = [...new Set([...agentTools, ...inferredTools])]

  return {
    permissionMode: 'default',
    allowedTools: allTools.length > 0 ? allTools : undefined,
    agentTools,
    inferredTools,
    ...(resolvedPath ? { inferredFrom: resolvedPath } : {}),
  }
}
