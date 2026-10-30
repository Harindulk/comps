import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import world from 'world-atlas/countries-110m.json'
import type { Block, Item } from './types'

const AGE_LABEL: Record<string, string> = {
  '24_and_younger': '24 and under', '25_to_29': '25-29', '30_to_34': '30-34', '35_to_44': '35-44', '45_to_54': '45-54', '55_and_older': '55+',
}
const fmt = (x?: number) => (x == null ? '-' : x.toFixed(2))

// Average skew across the comps, per age band; bars grow left (under-index) or right (over-index).
export function AgeSkew({ block }: { block: Block }) {
  const bands = Object.keys(AGE_LABEL)
  const avg = (key: 'age' | 'gender', k: string) => {
    const vals = block.items.map((i) => i[key]?.[k]).filter((v): v is number => typeof v === 'number')
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined
  }
  const rows = [...bands.map((b) => ({ label: AGE_LABEL[b], v: avg('age', b) })), { label: 'Male', v: avg('gender', 'male') }, { label: 'Female', v: avg('gender', 'female') }]
  const max = Math.max(0.2, ...rows.map((r) => Math.abs(r.v ?? 0)))
  return (
    <div className="bars" role="table" aria-label="Average audience skew across the comps">
      {rows.map((r, i) => (
        <div key={r.label} role="row" style={{ display: 'grid', gridTemplateColumns: '92px 1fr 1fr 44px', gap: 0, alignItems: 'center', marginTop: i === bands.length ? 10 : 0 }}>
          <span role="cell" className="small">{r.label}</span>
          <span role="cell" style={{ display: 'flex', justifyContent: 'flex-end', borderRight: '1px solid var(--control)', height: 14, alignItems: 'center' }}>
            {(r.v ?? 0) < 0 && <span style={{ height: 10, width: `${(Math.abs(r.v!) / max) * 100}%`, background: 'var(--control)', borderRadius: '2px 0 0 2px' }} />}
          </span>
          <span role="cell" style={{ display: 'flex', height: 14, alignItems: 'center' }}>
            {(r.v ?? 0) > 0 && <span style={{ height: 10, width: `${(r.v! / max) * 100}%`, background: 'var(--hue)', borderRadius: '0 2px 2px 0' }} />}
          </span>
          <span role="cell" className="val">{r.v == null ? '-' : (r.v > 0 ? '+' : '') + r.v.toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

const land = feature(world as never, (world as never as { objects: { countries: never } }).objects.countries) as never
const projection = geoNaturalEarth1().fitSize([640, 330], land)
const path = geoPath(projection)
const landPath = path(land) || ''

export function WorldMap({ blocks, onPick }: { blocks: Block[]; onPick: (ref: string) => void }) {
  const cells = blocks.flatMap((b) => b.items).filter((i) => i.lat != null && i.lon != null)
  const top = new Set([...cells].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0)).slice(0, 5).map((c) => c.id))
  return (
    <div className="map">
      <svg viewBox="0 0 640 330" role="img" aria-label={`Map of ${cells.length} places where fans of the comps over-index`}>
        <path d={landPath} fill="#e6e8ec" stroke="#fff" strokeWidth={0.5} />
        {cells.map((c) => {
          const [x, y] = projection([c.lon!, c.lat!]) || [0, 0]
          const a = Math.max(0.15, Math.min(1, c.affinity ?? 0.3))
          return (
            <circle key={c.id} cx={x} cy={y} r={top.has(c.id) ? 6 : 3.5} fill="var(--hue)" fillOpacity={0.25 + a * 0.6} stroke={top.has(c.id) ? '#fff' : 'none'} strokeWidth={1.5} style={{ cursor: 'pointer' }} onClick={() => onPick(c.id)}>
              <title>{`${c.name}: affinity ${fmt(c.affinity)}`}</title>
            </circle>
          )
        })}
      </svg>
      <div className="legend"><span><span className="key" />Area where comp fans over-index; darker is stronger</span><span>Large dots: the five strongest cells</span></div>
    </div>
  )
}

export function AffinityBars({ items, onPick, limit = 6 }: { items: Item[]; onPick: (ref: string) => void; limit?: number }) {
  const shown = items.slice(0, limit)
  const max = Math.max(...shown.map((i) => i.affinity ?? 0), 0.01)
  return (
    <div className="bars">
      {shown.map((i) => (
        <button key={i.id} className="barrow" onClick={() => onPick(i.id)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }} aria-label={`${i.name}, affinity ${fmt(i.affinity)}, open evidence ${i.id}`}>
          <span className="name">{i.name}{i.niche && <span className="pill niche" title="High affinity, lower popularity than the rest of this list">niche fit</span>}</span>
          <span className="track"><span className="fill" style={{ display: 'block', width: `${((i.affinity ?? 0) / max) * 100}%` }} /></span>
          <span className="val">{fmt(i.affinity)}</span>
        </button>
      ))}
    </div>
  )
}
