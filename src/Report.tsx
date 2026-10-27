import { useEffect, useMemo, useState } from 'react'
import type { Block, Item, Report as R, Run } from './types'
import { AffinityBars, AgeSkew, WorldMap } from './Charts'

const SECTION_DOMAIN: Record<string, string> = { music: 'artist', creators: 'podcast', look: 'tv_show' }
const TINTS = ['#e6eefa', '#e8f5ec', '#fbeee6', '#f1ebf8'] // pale identity tints, 60+ degrees apart
const INKS = ['#0f3a78', '#1c5130', '#7a3a12', '#4d2e73']

export function useEvidence(blocks: Block[]) {
  return useMemo(() => {
    const items = new Map<string, { block: Block; item?: Item }>()
    for (const b of blocks) {
      items.set(b.id, { block: b })
      for (const i of b.items) items.set(i.id, { block: b, item: i })
    }
    return items
  }, [blocks])
}

function Cites({ refs, lookup, onPick, baseline }: { refs: string[]; lookup: ReturnType<typeof useEvidence>; onPick: (r: string) => void; baseline?: boolean }) {
  if (baseline || !refs.length) return <div className="cites"><span className="cite none">No source</span></div>
  return (
    <div className="cites">
      {refs.map((r) => {
        const hit = lookup.get(r)
        return (
          <button key={r} className="cite" onClick={() => onPick(r)} title={hit?.block.title}>
            <b>{r}</b><span>{hit?.item?.name || hit?.block.title}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ReportView({ run }: { run: Run }) {
  const [mode, setMode] = useState<'qloo' | 'baseline'>('qloo')
  const [open, setOpen] = useState<string | null>(null)
  const lookup = useEvidence(run.evidence)
  const baselineOk = !('error' in run.baseline)
  const report: R = mode === 'baseline' && baselineOk ? (run.baseline as R) : run.report
  const isBase = mode === 'baseline'

  const claims = run.report.sections.flatMap((s) => s.claims)
  const cited = claims.filter((c) => c.evidence.length).length
  const points = run.evidence.reduce((n, b) => n + b.items.length, 0)
  const demo = run.evidence.find((b) => b.kind === 'demographics')
  const heat = run.evidence.filter((b) => b.kind === 'heatmap')
  const lists = run.evidence.filter((b) => b.kind === 'list')
  const tags = run.evidence.find((b) => b.kind === 'tags')
  const domainBlock = (d: string) => lists.find((b) => String(b.params['filter.type']).endsWith(`:${d}`))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <div className="titlerow">
        <div>
          <h1>{run.input.game.name}: launch plan</h1>
          <p className="sub">
            Comps: {run.input.comps.map((c) => c.name).join(', ')} · {run.meta.calls.length} Qloo calls · built {new Date(run.meta.finished).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="seg" role="group" aria-label="Which plan to show">
          <button aria-pressed={!isBase} onClick={() => setMode('qloo')}>With Qloo</button>
          <button aria-pressed={isBase} onClick={() => setMode('baseline')} disabled={!baselineOk}>Without Qloo</button>
        </div>
      </div>

      {isBase && (
        <p className="notice">Same model, same brief, no Qloo data. None of these {report.sections.flatMap((s) => s.claims).length} claims can be traced to a source, and none name a specific artist, podcast or city backed by an audience measure.</p>
      )}

      <div className="card reveal">
        <p className="small muted" style={{ marginBottom: 8 }}>{run.input.game.pitch}</p>
        <p className="positioning">{report.positioning}</p>
      </div>

      <div className="grid4">
        <div className="card stat reveal"><div className="label">Qloo calls the agent chose</div><div className="value">{isBase ? 0 : run.meta.calls.length}</div><div className="foot">{new Set(run.meta.calls.map((c) => c.tool)).size} different endpoints</div></div>
        <div className="card stat reveal"><div className="label">Data points read</div><div className="value">{isBase ? 0 : points}</div><div className="foot">entities, tags, places, skews</div></div>
        <div className="card stat reveal"><div className="label">Claims with a source</div><div className="value">{isBase ? `0 of ${report.sections.flatMap((s) => s.claims).length}` : `${cited} of ${claims.length}`}</div><div className="foot">click any chip to check it</div></div>
        <div className="card stat reveal"><div className="label">Panel verdict</div><div className="value">{report.player_panel.filter((p) => p.verdict === 'buy').length} buy · {report.player_panel.filter((p) => p.verdict === 'wishlist').length} wishlist</div><div className="foot">{report.player_panel.filter((p) => p.verdict === 'pass').length} pass, of {report.player_panel.length} players</div></div>
      </div>

      {!isBase && (
        <div className="grid2">
          <div className="card">
            <h2>Who plays the comps</h2>
            <p className="lede">Average skew across the comp audiences against the typical Qloo user. Right of the line means over-represented.</p>
            {demo ? <AgeSkew block={demo} /> : <p className="muted">No demographic data came back for these comps.</p>}
            {demo && <button className="cite" style={{ marginTop: 14 }} onClick={() => setOpen(demo.id)}><b>{demo.id}</b><span>per-comp breakdown</span></button>}
          </div>
          <div className="card">
            <h2>Where they live</h2>
            <p className="lede">Heatmap cells from {heat.length} Qloo call{heat.length === 1 ? '' : 's'}. Click a dot for its scores.</p>
            {heat.length ? <WorldMap blocks={heat} onPick={setOpen} /> : <p className="muted">No geography data came back.</p>}
          </div>
        </div>
      )}

      {report.sections.map((s) => {
        const side = !isBase && SECTION_DOMAIN[s.kind] ? domainBlock(SECTION_DOMAIN[s.kind]) || (s.kind === 'look' ? domainBlock('movie') : undefined) : undefined
        return (
          <section key={s.kind} className="card" aria-labelledby={`h-${s.kind}`}>
            <div className={side ? 'split' : ''}>
              <div>
                <h2 id={`h-${s.kind}`}>{s.heading}</h2>
                <ul className="claims">
                  {s.claims.map((c, i) => (
                    <li key={i}><p>{c.text}</p><Cites refs={c.evidence} lookup={lookup} onPick={setOpen} baseline={isBase} /></li>
                  ))}
                </ul>
              </div>
              {side && (
                <aside style={{ background: 'var(--ground)', borderRadius: 'var(--radius-control)', padding: 16 }} aria-label={side.title}>
                  <p className="small muted" style={{ marginBottom: 10 }}>{side.title} · affinity</p>
                  <AffinityBars items={side.items} onPick={setOpen} />
                </aside>
              )}
            </div>
          </section>
        )
      })}

      <section className="card" aria-labelledby="h-panel">
        <h2 id="h-panel">Player panel</h2>
        <p className="lede">{isBase ? 'Four imagined players, with nothing behind them.' : 'Four players built from the cited audience data, reacting to the pitch.'}</p>
        <div className="grid4" style={{ gap: 20 }}>
          {report.player_panel.map((p, i) => (
            <article key={p.name} className="panelist">
              <div className="who">
                <span className="avatar" style={{ background: TINTS[i % 4], color: INKS[i % 4] }} aria-hidden>{p.name[0]}</span>
                <div><div style={{ fontWeight: 600 }}>{p.name}</div><span className={`pill ${p.verdict}`}>{p.verdict === 'buy' ? 'Would buy' : p.verdict === 'wishlist' ? 'Would wishlist' : 'Would pass'}</span></div>
              </div>
              <p className="small muted">{p.profile}</p>
              <p className="quote">{p.reaction}</p>
              <Cites refs={p.evidence} lookup={lookup} onPick={setOpen} baseline={isBase} />
            </article>
          ))}
        </div>
      </section>

      <div className="grid2">
        <section className="card" aria-labelledby="h-copy">
          <h2 id="h-copy">Store page draft</h2>
          <p className="quote" style={{ margin: '8px 0 12px' }}>{report.store_copy.short_description}</p>
          <div className="tags">{report.store_copy.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
          <Cites refs={report.store_copy.evidence} lookup={lookup} onPick={setOpen} baseline={isBase} />
        </section>
        <section className="card" aria-labelledby="h-tags">
          <h2 id="h-tags">Taste tags behind it</h2>
          {!isBase && tags ? (
            <>
              <p className="lede">What fans of the comps over-index on, from {tags.id}.</p>
              <div className="tags">{tags.items.slice(0, 18).map((t) => <button key={t.id} className="tag" style={{ border: 0, cursor: 'pointer' }} onClick={() => setOpen(t.id)}>{t.name}</button>)}</div>
            </>
          ) : <p className="lede">{isBase ? 'Without Qloo there is no tag data; the tags on the left are the model\'s guess.' : 'No tag data came back.'}</p>}
        </section>
      </div>

      {!isBase && (
        <section className="card" aria-labelledby="h-ledger">
          <h2 id="h-ledger">Evidence ledger</h2>
          <p className="lede">Every Qloo call the agent made, in order. The plan above cites these by ID.</p>
          <table className="ledger">
            <thead><tr><th>ID</th><th>What the agent asked</th><th>Endpoint</th><th className="n">Items</th><th className="n">Cited</th></tr></thead>
            <tbody>
              {run.evidence.map((b) => {
                const n = JSON.stringify(run.report).split(`"${b.id}.`).length - 1 + (JSON.stringify(run.report).split(`"${b.id}"`).length - 1)
                return (
                  <tr key={b.id}>
                    <td className="num">{b.id}</td>
                    <td><button onClick={() => setOpen(b.id)}>{b.title}</button></td>
                    <td className="small muted">{b.endpoint}</td>
                    <td className="n">{b.items.length}</td>
                    <td className="n">{n}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {open && <EvidenceDrawer refId={open} lookup={lookup} onClose={() => setOpen(null)} />}
    </>
  )
}

function EvidenceDrawer({ refId, lookup, onClose }: { refId: string; lookup: ReturnType<typeof useEvidence>; onClose: () => void }) {
  const hit = lookup.get(refId)
  if (!hit) return null
  const { block, item } = hit
  const n = (x?: number) => (x == null ? '-' : x.toFixed(2))
  const query = Object.entries(block.params).map(([k, v]) => `${k}=${v}`).join('&')
  return (
    <aside className="drawer" role="dialog" aria-modal="false" aria-labelledby="drawer-title">
      <header>
        <div style={{ flex: 1 }}>
          <p className="small muted">{block.id}{item ? ` · item ${item.id}` : ''}</p>
          <h2 id="drawer-title" style={{ fontSize: 16, fontWeight: 600 }}>{item?.name || block.title}</h2>
          {item && <p className="small muted">{block.title}</p>}
        </div>
        <button className="btn quiet" onClick={onClose} autoFocus>Close</button>
      </header>
      <div className="body">
        {item?.driven_by?.length ? (
          <div>
            <p className="small muted" style={{ marginBottom: 6 }}>Which comp drove this (Qloo explainability)</p>
            <AffinityBars items={item.driven_by.map((d, i) => ({ id: `${i}`, name: d.name, affinity: d.score }))} onPick={() => {}} />
          </div>
        ) : null}
        {block.note && <p className="small muted">{block.note}</p>}
        {block.kind === 'demographics' ? (
          <table>
            <thead><tr><th>Comp</th>{Object.keys(block.items[0]?.age || {}).map((k) => <th key={k} className="n">{k.replace(/_/g, ' ').replace('and ', '')}</th>)}</tr></thead>
            <tbody>{block.items.map((i) => <tr key={i.id} className={i.id === refId ? 'hit' : ''}><td>{i.name}</td>{Object.values(i.age || {}).map((v, k) => <td key={k} className="n">{n(v)}</td>)}</tr>)}</tbody>
          </table>
        ) : block.kind === 'trending' ? (
          <table>
            <thead><tr><th>Comp</th><th className="n">Percentile</th><th className="n">Velocity</th><th className="n">Days</th></tr></thead>
            <tbody>{block.items.map((i) => <tr key={i.id} className={i.id === refId ? 'hit' : ''}><td>{i.name}</td><td className="n">{n(i.percentile)}</td><td className="n">{n(i.velocity)}</td><td className="n">{i.series?.length ?? 0}</td></tr>)}</tbody>
          </table>
        ) : block.kind === 'compare' ? (
          <table>
            <thead><tr><th>Entity</th><th className="n">a</th><th className="n">b</th><th className="n">Delta</th></tr></thead>
            <tbody>{block.items.map((i) => <tr key={i.id} className={i.id === refId ? 'hit' : ''}><td>{i.name}<div className="small muted">{i.subtype}</div></td><td className="n">{n(i.a)}</td><td className="n">{n(i.b)}</td><td className="n">{n(i.delta)}</td></tr>)}</tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>{block.kind === 'heatmap' ? 'Place' : 'Name'}</th><th className="n">Affinity</th>{block.kind !== 'tags' && <th className="n">Popularity</th>}</tr></thead>
            <tbody>{block.items.map((i) => <tr key={i.id} className={i.id === refId ? 'hit' : ''}><td><span className="muted small num">{i.id}</span> {i.name}{i.tags?.length ? <div className="small muted">{i.tags.join(', ')}</div> : null}</td><td className="n">{n(i.affinity)}</td>{block.kind !== 'tags' && <td className="n">{n(i.popularity)}</td>}</tr>)}</tbody>
          </table>
        )}
        <div className="params"><p style={{ marginBottom: 4 }}>The Qloo request behind it</p><code>GET {block.endpoint}?{query}</code></div>
      </div>
    </aside>
  )
}
