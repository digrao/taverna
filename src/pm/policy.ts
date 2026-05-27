// Policy management for trunk-based CI/CD
// Integrates with policies.yaml to control taverna orchestration

import { z } from 'zod'
import * as fs from 'fs'
import yaml from 'js-yaml'

/**
 * Policy schemas (mirrors policies.schema.ts from root)
 */

export const BuildTypeSchema = z.enum(['typescript', 'node', 'python'])
export type BuildType = z.infer<typeof BuildTypeSchema>

export const StrategySchema = z.enum(['trunk', 'feature-branch'])
export type Strategy = z.infer<typeof StrategySchema>

export const DeployEnvSchema = z.enum(['local', 'staging', 'production'])
export type DeployEnv = z.infer<typeof DeployEnvSchema>

export const EventTypeSchema = z.enum([
  'build_started',
  'build_completed',
  'build_failed',
  'deploy_started',
  'deploy_completed',
  'deploy_failed',
  'health_check_failed',
  'rollback_executed',
  'agent_run',
  'project_snapshot',
  'vault_snapshot',
])
export type EventType = z.infer<typeof EventTypeSchema>

export const ProjectPolicySchema = z.object({
  description: z.string(),
  build_type: BuildTypeSchema,
  test_enabled: z.boolean().default(true),
  deploy_enabled: z.boolean().default(false),
  deploy_env: DeployEnvSchema.optional(),
  service_name: z.string().optional(),
  pre_deploy: z.array(z.string()).default([]),
  post_deploy: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  auto_trigger: z.boolean().default(true),
})
export type ProjectPolicy = z.infer<typeof ProjectPolicySchema>

export const GlobalPolicySchema = z.object({
  branch: z.string().default('master'),
  strategy: StrategySchema.default('trunk'),
  require_ci: z.boolean().default(true),
  concurrent_builds: z.number().int().positive().default(1),
  rollback_on_failure: z.boolean().default(true),
  keep_backups: z.number().int().nonnegative().default(3),
})
export type GlobalPolicy = z.infer<typeof GlobalPolicySchema>

export const TavernaScheduleSchema = z.object({
  check_interval_sec: z.number().int().positive(),
  max_concurrent_agents: z.number().int().positive(),
  drain_batch_size: z.number().int().positive(),
})
export type TavernaSchedule = z.infer<typeof TavernaScheduleSchema>

export const PoliciesSchema = z.object({
  policies: z.object({
    global: GlobalPolicySchema,
    projects: z.record(z.string(), ProjectPolicySchema),
    ci_command: z.string().default('npm run ci'),
    taverna_schedule: TavernaScheduleSchema,
  }),
})

export type Policies = z.infer<typeof PoliciesSchema>

/**
 * Policy resolver for taverna
 */
export class PolicyResolver {
  private policies: Policies
  private policyPath: string

  constructor(policyPath: string = '/home/jvcm/tools/policies.yaml') {
    this.policyPath = policyPath
    this.policies = this.loadPolicies()
  }

  private loadPolicies(): Policies {
    if (!fs.existsSync(this.policyPath)) {
      throw new Error(`Policies file not found: ${this.policyPath}`)
    }

    const content = fs.readFileSync(this.policyPath, 'utf-8')
    const parsed = yaml.load(content) as unknown

    return PoliciesSchema.parse(parsed)
  }

  /**
   * Reload policies (for watching changes)
   */
  public reload(): void {
    this.policies = this.loadPolicies()
  }

  /**
   * Get global policy
   */
  public getGlobalPolicy(): GlobalPolicy {
    return this.policies.policies.global
  }

  /**
   * Get project policy with defaults
   */
  public getProjectPolicy(projectId: string): ProjectPolicy {
    const policy = this.policies.policies.projects[projectId]
    if (!policy) {
      throw new Error(`Project policy not found: ${projectId}`)
    }
    return policy
  }

  /**
   * Get all project policies
   */
  public getAllProjectPolicies(): Record<string, ProjectPolicy> {
    return this.policies.policies.projects
  }

  /**
   * Get taverna schedule configuration
   */
  public getTavernaSchedule(): TavernaSchedule {
    return this.policies.policies.taverna_schedule
  }

  /**
   * Get CI command (default or custom)
   */
  public getCICommand(_projectId?: string): string {
    return this.policies.policies.ci_command
  }

  /**
   * Check if project should auto-trigger
   */
  public shouldAutoTrigger(projectId: string): boolean {
    try {
      return this.getProjectPolicy(projectId).auto_trigger
    } catch {
      return false
    }
  }

  /**
   * Get projects that should auto-trigger
   */
  public getAutoTriggerProjects(): string[] {
    return Object.entries(this.policies.policies.projects)
      .filter(([, policy]) => policy.auto_trigger)
      .map(([id]) => id)
  }

  /**
   * Get projects that are deployable
   */
  public getDeployableProjects(): string[] {
    return Object.entries(this.policies.policies.projects)
      .filter(([, policy]) => policy.deploy_enabled)
      .map(([id]) => id)
  }

  /**
   * Get project dependencies
   */
  public getProjectDependencies(projectId: string): string[] {
    try {
      return this.getProjectPolicy(projectId).dependencies || []
    } catch {
      return []
    }
  }

  /**
   * Check if a project's dependencies are satisfied
   */
  public areDependenciesSatisfied(projectId: string, completedProjects: Set<string>): boolean {
    const deps = this.getProjectDependencies(projectId)
    return deps.every((dep) => completedProjects.has(dep))
  }

  /**
   * Get max concurrent agents (from taverna schedule)
   */
  public getMaxConcurrentAgents(): number {
    return this.getTavernaSchedule().max_concurrent_agents
  }

  /**
   * Get drain batch size (for --drain)
   */
  public getDrainBatchSize(): number {
    return this.getTavernaSchedule().drain_batch_size
  }

  /**
   * Get check interval (in seconds)
   */
  public getCheckInterval(): number {
    return this.getTavernaSchedule().check_interval_sec
  }

  /**
   * Verify that the strategy matches trunk-based
   */
  public isTrunkBased(): boolean {
    return this.getGlobalPolicy().strategy === 'trunk'
  }

  /**
   * Get required branch for deployments
   */
  public getRequiredBranch(): string {
    return this.getGlobalPolicy().branch
  }

  /**
   * Format policy report (for `taverna policy` command)
   */
  public formatPolicyReport(projectId?: string): string {
    let report = ''

    if (projectId) {
      const policy = this.getProjectPolicy(projectId)
      report = `Project Policy: ${projectId}\n`
      report += `  Description: ${policy.description}\n`
      report += `  Build Type: ${policy.build_type}\n`
      report += `  Test Enabled: ${policy.test_enabled}\n`
      report += `  Deploy Enabled: ${policy.deploy_enabled}\n`
      if (policy.deploy_env) {
        report += `  Deploy Environment: ${policy.deploy_env}\n`
      }
      if (policy.service_name) {
        report += `  Service Name: ${policy.service_name}\n`
      }
      report += `  Auto Trigger: ${policy.auto_trigger}\n`
      if (policy.dependencies.length > 0) {
        report += `  Dependencies: ${policy.dependencies.join(', ')}\n`
      }
      if (policy.pre_deploy.length > 0) {
        report += `  Pre-Deploy Hooks: ${policy.pre_deploy.length}\n`
      }
      if (policy.post_deploy.length > 0) {
        report += `  Post-Deploy Hooks: ${policy.post_deploy.length}\n`
      }
    } else {
      report = `Global Policy\n`
      const global = this.getGlobalPolicy()
      report += `  Branch: ${global.branch}\n`
      report += `  Strategy: ${global.strategy}\n`
      report += `  Require CI: ${global.require_ci}\n`
      report += `  Concurrent Builds: ${global.concurrent_builds}\n`
      report += `  Rollback on Failure: ${global.rollback_on_failure}\n`
      report += `\nProject Policies\n`
      report += `  Auto-Trigger: ${this.getAutoTriggerProjects().join(', ')}\n`
      report += `  Deployable: ${this.getDeployableProjects().join(', ')}\n`
      report += `\nTaverna Schedule\n`
      const schedule = this.getTavernaSchedule()
      report += `  Check Interval: ${schedule.check_interval_sec}s\n`
      report += `  Max Concurrent Agents: ${schedule.max_concurrent_agents}\n`
      report += `  Drain Batch Size: ${schedule.drain_batch_size}\n`
    }

    return report
  }

  /**
   * Export as JSON (for API endpoints)
   */
  public toJSON(): Policies {
    return this.policies
  }
}

/**
 * Singleton instance
 */
let instance: PolicyResolver | null = null

export function getPolicyResolver(): PolicyResolver {
  if (!instance) {
    instance = new PolicyResolver()
  }
  return instance
}

export function createPolicyResolver(policyPath: string): PolicyResolver {
  return new PolicyResolver(policyPath)
}
