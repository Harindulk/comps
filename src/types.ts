export type Comp = { id: string; name: string; year?: string | null; image?: string | null; popularity?: number }

export type Driver = { name: string; score: number }
export type Item = {
  id: string
  name: string
  qloo_id?: string
  affinity?: number
  popularity?: number
  subtype?: string
  tags?: string[]
  driven_by?: Driver[]
  niche?: boolean
  kind?: string
  domain?: string
  // demographics
  age?: Record<string, number>
  gender?: Record<string, number>
  // heatmap
  lat?: number
  lon?: number
  region?: string
  // compare
  side?: string
  score?: number
  // trending
  series?: { date: string; percentile: number; rank: number }[]
  percentile?: number
  change?: number
  source?: string
  from?: string
  to?: string
  error?: string
  status?: string
  segment?: string
}
export type Block = {
  id: string
  kind: 'list' | 'tags' | 'demographics' | 'heatmap' | 'compare' | 'trending' | 'shortlist' | 'segment'
  title: string
  endpoint: string
  params: Record<string, unknown>
  items: Item[]
  note?: string
}

export type Claim = { text: string; evidence: string[] }
export type Section = { kind: string; heading: string; claims: Claim[] }
export type Panelist = { name: string; profile: string; reaction: string; verdict: 'buy' | 'wishlist' | 'pass'; evidence: string[] }
export type Report = {
  positioning: string
  decisions?: { label: string; text: string; evidence: string[] }[]
  shortlist_verdicts?: { name: string; verdict: 'keep' | 'test' | 'drop' | 'unscored'; reason: string; evidence: string[] }[]
  sections: Section[]
  store_copy: { short_description: string; tags: string[]; evidence: string[] }
  player_panel: Panelist[]
}
export type Run = {
  input: { game: { name: string; pitch: string }; comps: Comp[]; shortlist?: string[] }
  report: Report
  baseline: Report | { error: string }
  evidence: Block[]
  meta: {
    model: string
    calls: { tool: string; input?: Record<string, unknown>; evidence?: string; error?: string }[]
    usage: Record<string, number>
    dropped_citations: number
    finished: string
    // newer runs only
    numbers?: { checked: number; matched: number; unmatched: { where: string; value: string | number }[] }
    citations?: { item: number; block: number }
  }
}
export type Step = { tool: string; label: string; evidence?: string; error?: string }
