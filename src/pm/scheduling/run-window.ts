export interface RunWindowResult {
  open: boolean
  reason?: 'run_window'
  nextEligibleAt?: string
}

export function isInTimeWindow(window: string, now: Date): boolean {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(window)
  if (!match) return true // malformed → do not block

  const start = Number(match[1]) * 60 + Number(match[2])
  const end = Number(match[3]) * 60 + Number(match[4])
  const cur = now.getHours() * 60 + now.getMinutes()

  return start <= end
    ? cur >= start && cur < end // same-day window
    : cur >= start || cur < end // crosses midnight
}

function nextWindowOpen(window: string, now: Date): string | undefined {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(window)
  if (!match) return undefined

  const startH = Number(match[1])
  const startM = Number(match[2])

  const next = new Date(now)
  next.setHours(startH, startM, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.toISOString()
}

export function isRunWindowOpen(runWindow: string | undefined, now: Date): RunWindowResult {
  if (!runWindow || runWindow === 'always') return { open: true }

  if (!isInTimeWindow(runWindow, now)) {
    const nextEligibleAt = nextWindowOpen(runWindow, now)
    return {
      open: false,
      reason: 'run_window',
      ...(nextEligibleAt !== undefined ? { nextEligibleAt } : {}),
    }
  }

  return { open: true }
}
