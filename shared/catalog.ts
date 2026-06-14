// The Nord product catalog. Static + typed — products/plans never change at
// runtime, so this is a constant, not a DB table. polarProductId is NOT here
// (it stays server-only env in server/services/polar-products.ts); the client
// only needs slugs + display.

export interface CatalogProduct {
  slug: string
  name: string
  tagline: string
  icon: string // i-lucide-* (bundled locally → CSP-safe)
  color: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
  category: string
  /** oauthClient.name this product corresponds to (entitlement mapping); null = no RP app. */
  clientName: string | null
  appUrl: string | null
  downloadUrl: string | null
}

export interface CatalogPlan {
  slug: string // matches subscription.planSlug
  productSlug: string
  name: string
  billingInterval: 'month' | 'year' | 'none'
  priceCents: number // display only; Polar is the billing authority
  currency: string
  seats: number // 1 = individual; 6 = NordPass Family
  features: string[]
}

export const PRODUCTS: readonly CatalogProduct[] = [
  { slug: 'nordvpn', name: 'NordVPN', tagline: 'Online security starts with a click.', icon: 'i-lucide-shield-check', color: 'info', category: 'VPN', clientName: 'NordVPN', appUrl: 'https://nordvpn.com', downloadUrl: 'https://nordvpn.com/download/' },
  { slug: 'nordpass', name: 'NordPass', tagline: 'Remember just one password.', icon: 'i-lucide-key-round', color: 'primary', category: 'Password Manager', clientName: 'NordPass', appUrl: 'https://nordpass.com', downloadUrl: 'https://nordpass.com/download/' },
  { slug: 'nordlocker', name: 'NordLocker', tagline: 'Encrypted cloud storage.', icon: 'i-lucide-folder-lock', color: 'success', category: 'Encrypted Storage', clientName: 'NordLocker', appUrl: 'https://nordlocker.com', downloadUrl: 'https://nordlocker.com/download/' },
  { slug: 'dark-web-monitor', name: 'Dark Web Monitor', tagline: 'Get alerts if your data leaks.', icon: 'i-lucide-radar', color: 'error', category: 'Security', clientName: null, appUrl: null, downloadUrl: null },
] as const

export const PLANS: readonly CatalogPlan[] = [
  { slug: 'nordvpn-complete', productSlug: 'nordvpn', name: 'NordVPN Complete', billingInterval: 'year', priceCents: 7188, currency: 'USD', seats: 1, features: ['VPN on 10 devices', 'Threat Protection Pro', 'Dark Web Monitor', '1 TB encrypted storage'] },
  { slug: 'dark-web-monitor', productSlug: 'dark-web-monitor', name: 'Dark Web Monitor', billingInterval: 'year', priceCents: 0, currency: 'USD', seats: 1, features: ['Continuous breach scanning', 'Instant leak alerts'] },
  { slug: 'nordpass-premium', productSlug: 'nordpass', name: 'NordPass Premium', billingInterval: 'year', priceCents: 3588, currency: 'USD', seats: 1, features: ['Unlimited passwords & passkeys', 'Data Breach Scanner', 'Email masking', 'Password Health'] },
  { slug: 'nordpass-family', productSlug: 'nordpass', name: 'NordPass Family', billingInterval: 'year', priceCents: 8388, currency: 'USD', seats: 6, features: ['6 Premium accounts', 'Family folder sharing', 'Individual private vaults'] },
  { slug: 'nordlocker-free', productSlug: 'nordlocker', name: 'NordLocker Free, 3 GB', billingInterval: 'none', priceCents: 0, currency: 'USD', seats: 1, features: ['3 GB encrypted storage', 'Secure file sharing'] },
] as const

export function planBySlug(slug: string): CatalogPlan | undefined {
  return PLANS.find(p => p.slug === slug)
}
export function productBySlug(slug: string): CatalogProduct | undefined {
  return PRODUCTS.find(p => p.slug === slug)
}
export function productByClientName(name: string): CatalogProduct | undefined {
  return PRODUCTS.find(p => p.clientName === name)
}
export function plansForProduct(productSlug: string): CatalogPlan[] {
  return PLANS.filter(p => p.productSlug === productSlug)
}
