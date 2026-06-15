// Pure, isomorphic helpers (client + server). No DB imports here.

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired'
export type SubscriptionSource = 'seed' | 'polar'
export type FamilyMemberStatus = 'owner' | 'member' | 'invited'

export interface FamilyMember {
  id: string
  email: string
  userId: string | null
  status: FamilyMemberStatus
  createdAt: number
}

export interface SubscriptionRow {
  id: string
  userId: string
  planSlug: string
  status: SubscriptionStatus
  currentPeriodEnd: number | null // epoch ms
  cancelAtPeriodEnd: boolean
  seats: number
  source: SubscriptionSource
  polarSubscriptionId: string | null
  polarCustomerId: string | null
  createdAt: number
  updatedAt: number
}

/**
 * SINGLE source of "is this entitlement live right now" — used by UI, the
 * entitlements claim, and any gate. Never compare the raw status string ad hoc.
 * null currentPeriodEnd = perpetual (free tier) → active while status is active.
 */
export function isActive(sub: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd'>, now = Date.now()): boolean {
  if (sub.status !== 'active' && sub.status !== 'trialing')
    return false
  if (sub.currentPeriodEnd == null)
    return true
  return sub.currentPeriodEnd > now
}

/** "Renews on October 3, 2027" / "Expired on December 14, 2023" — formatted from a UTC epoch. */
export function formatPeriodEnd(sub: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>, now = Date.now()): string {
  if (sub.currentPeriodEnd == null)
    return sub.status === 'active' ? 'Free' : ''
  const d = new Date(sub.currentPeriodEnd)
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const expired = !isActive(sub, now)
  if (expired)
    return `Expired on ${date}`
  return sub.cancelAtPeriodEnd ? `Cancels on ${date}` : `Renews on ${date}`
}
