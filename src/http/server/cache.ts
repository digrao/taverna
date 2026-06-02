import type { VaultState } from '../../vault/types.js'
import type { TavernaConfig } from '../../config.js'
import { scanVault } from '../../vault/index.js'

const TTL_MS = 30_000

export class VaultCache {
  private cached: { state: VaultState; expiresAt: number } | null = null
  private pending: Promise<VaultState> | null = null
  onRefresh?: (state: VaultState) => void

  constructor(private config: TavernaConfig) {}

  async get(): Promise<VaultState> {
    if (this.cached && Date.now() < this.cached.expiresAt) return this.cached.state
    if (this.pending) return this.pending

    this.pending = scanVault(this.config).then((state) => {
      this.cached = { state, expiresAt: Date.now() + TTL_MS }
      this.pending = null
      this.onRefresh?.(state)
      return state
    })
    return this.pending
  }

  invalidate(): void {
    this.cached = null
  }
}
