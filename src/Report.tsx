import { useEffect, useMemo, useState } from 'react'
import type { Block, Item, Report as R, Run } from './types'
import { AffinityBars, AgeSkew, WorldMap } from './Charts'

const SECTION_DOMAIN: Record<string, string> = { music: 'artist', creators: 'podcast', look: 'tv_show' }
const DECISION_LABEL: Record<string, string> = { who: 'Who it is for', hook: 'The cultural hook', where: 'Where to start' }
const TINTS = ['#e6eefa', '#e8f5ec', '#fbeee6', '#f1ebf8'] // pale identity tints, 60+ degrees apart
const INKS = ['#0f3a78', '#1c5130', '#7a3a12', '#4d2e73']

const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const VERDICT: Record<string, string> = { keep: 'Keep', test: 'Test', drop: 'Drop', unscored: 'Not scored' }

// Which comps Qloo's explainability says drove the taste results; empty when the run has no explainability.
export function coverage(run: Run) {
  const comps = run.input.comps.map((c) => c.name)
  const led = new Map<string, number>()
  const drove = new Set<string>()
  let total = 0
  for (const b of run.evidence) {
    if (!['list', 'segment', 'shortlist'].includes(b.kind)) continue
    for (const i of b.items) {
      const ds = (i.driven_by || []).filter((d) => d.score > 0)
      if (!ds.length) continue
      total++
      ds.forEach((d) => drove.add(d.name))
      led.set(ds[0].name, (led.get(ds[0].name) || 0) + 1)
    }
  }
  if (!total) return ''
  const yes = comps.filter((c) => drove.has(c)), no = comps.filter((c) => !drove.has(c))
  if (!yes.length) return ''
  if (!no.length) {
    const [top, n] = [...led].sort((a, b) => b[1] - a[1])[0]
    return `Signal came from all ${comps.length} comps; ${top} led ${n} of ${total} results.`
  }
  return `Signal came from ${and(yes)}; ${and(no)} added none.`
}

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
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(location.search).get('evidence'))
  const lookup = useEvidence(run.evidence)
  const baselineOk = !('error' in run.baseline)
  const report: R = mode === 'baseline' && baselineOk ? (run.baseline as R) : run.report
  const isBase = mode === 'baseline'

  const claims = run.report.sections.flatMap((s) => s.claims)
  const cited = claims.filter((c) => c.evidence.length).length
  const kinds = new Set(run.meta.calls.map((c) => c.tool)).size
  const points = run.evidence.reduce((n, b) => n + b.items.length, 0)
  const demo = run.evidence.find((b) => b.kind === 'demographics')
  const heat = run.evidence.filter((b) => b.kind === 'heatmap')
  const lists = run.evidence.filter((b) => b.kind === 'list')
  const tags = run.evidence.find((b) => b.kind === 'tags')
  const segments = run.evidence.filter((b) => b.kind === 'segment')
  const cover = coverage(run)
  const places = heat.flatMap((b) => b.items.slice(0, 2)).slice(0, 6).map((i) => i.id)
  const failed = run.meta.calls.filter((c) => c.error)
  const okCalls = run.meta.calls.length - failed.length
  const nums = run.meta.numbers
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
            Comps: {run.input.comps.map((c) => c.name).join(', ')} · {okCalls} Qloo calls · built {new Date(run.meta.finished).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="seg" role="group" aria-label="Which plan to show">
          <button aria-pressed={!isBase} onClick={() => setMode('qloo')}>With Qloo <span className="num">· {cited} cited</span></button>
          <button aria-pressed={isBase} onClick={() => setMode('baseline')} disabled={!baselineOk}>Without Qloo <span className="num">· 0 cited</span></button>
        </div>
      </div>

      {isBase && (
        <p className="notice">Same model, same brief, no Qloo data. None of these {report.sections.flatMap((s) => s.claims).length} claims can be traced to a source, and none name a specific artist, podcast or city backed by an audience measure.</p>
      )}

      <div className="card reveal">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {run.input.comps.map((c) => (
            <span key={c.id} className="tag" style={{ paddingLeft: c.image ? 3 : 10, gap: 8 }}>{c.image && <img src={c.image} alt="" className="thumb" style={{ width: 20, height: 20, borderRadius: 10 }} />}{c.name}</span>
          ))}
          <span className="small muted">{run.input.game.pitch}</span>
        </div>
        <p className="positioning">{report.positioning}</p>
      </div>

      <div className={isBase ? '' : 'split lead'}>
        {report.decisions?.length ? (
          <section className="card reveal" aria-labelledby="h-decisions">
            <h2 id="h-decisions">Your launch in three decisions</h2>
            <div className={isBase ? 'grid3' : 'stack'} style={{ marginTop: 12 }}>
              {report.decisions.map((d) => (
                <div key={d.label} className="decision">
                  <p className="small muted">{DECISION_LABEL[d.label] || d.label}</p>
                  <p className="decision-text">{d.text}</p>
                  <Cites refs={d.evidence} lookup={lookup} onPick={setOpen} baseline={isBase} />
                </div>
              ))}
            </div>
            {!isBase && <p className="small muted" style={{ marginTop: 16 }}>What Qloo changed: {cited} of {claims.length} claims in this plan rest on Qloo evidence you can open. The same model with the same brief and no Qloo cites none.</p>}
            {!isBase && cover && <p className="small muted" style={{ marginTop: 6 }}>{cover}</p>}
          </section>
        ) : null}
        {!isBase && (
          <section className="card reveal" aria-labelledby="h-where">
            <h2 id="h-where">Where they live</h2>
            <p className="lede">Where this taste concentrates, from {heat.length} Qloo heatmap call{heat.length === 1 ? '' : 's'}. It shows taste, not a sales forecast. Click a dot for its scores.</p>
            {heat.length ? <WorldMap blocks={heat} onPick={setOpen} /> : <p className="muted">No geography data came back.</p>}
            {places.length ? <Cites refs={places} lookup={lookup} onPick={setOpen} /> : null}
          </section>
        )}
      </div>

      <div className="grid4">
        <div className="card stat reveal"><div className="label">Qloo calls the agent chose</div><div className="value">{isBase ? 0 : okCalls}</div><div className="note">{kinds} kind{kinds === 1 ? '' : 's'} of Qloo query{failed.length ? ` · ${failed.length} failed` : ''}</div></div>
        <div className="card stat reveal"><div className="label">Data points read</div><div className="value">{isBase ? 0 : points}</div><div className="note">entities, tags, places, skews</div></div>
        <div className="card stat reveal"><div className="label">Claims with a source</div><div className="value">{isBase ? `0 of ${report.sections.flatMap((s) => s.claims).length}` : `${cited} of ${claims.length}`}</div><div className="note">{!isBase && nums?.checked ? `${nums.matched} of ${nums.checked} numbers match their evidence` : 'click any chip to check it'}</div></div>
        <div className="card stat reveal"><div className="label">Panel verdict</div><div className="value">{report.player_panel.filter((p) => p.verdict === 'buy').length} buy · {report.player_panel.filter((p) => p.verdict === 'wishlist').length} wishlist</div><div className="note">{report.player_panel.filter((p) => p.verdict === 'pass').length} pass, of {report.player_panel.length} players</div></div>
      </div>

      {!isBase && report.shortlist_verdicts?.length ? (
        <section className="card" aria-labelledby="h-shortlist">
          <h2 id="h-shortlist">Pitch check</h2>
          <p className="lede">The names you were going to pitch, scored by Qloo against these players with filter.results.entities. Affinity ranks them against each other; it is not a probability.</p>
          <ul className="claims">
            {report.shortlist_verdicts.map((v) => {
              const items = v.evidence.map((r) => lookup.get(r)?.item)
              const it = items.find((x) => x?.affinity != null)
              // Older reports gave unfound names "test"; a name Qloo could not score is never a verdict.
              const verdict = !it && items.some((x) => x?.status && x.status !== 'scored') ? 'unscored' : v.verdict
              return (
                <li key={v.name} className="verdict-row">
                  <span className={`pill ${verdict}`}>{VERDICT[verdict] || verdict}</span>
                  <div>
                    <p><b style={{ fontWeight: 600 }}>{v.name}</b>{it?.affinity != null && <span className="muted num"> · affinity {it.affinity.toFixed(2)}</span>}</p>
                    <p className="small muted">{v.reason}</p>
                    <Cites refs={v.evidence} lookup={lookup} onPick={setOpen} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {!isBase && (
        <div className={segments.length ? 'grid2' : ''}>
          <div className="card">
            <h2>Who plays the comps</h2>
            <p className="lede">Average skew across the comp audiences against the typical Qloo user. Right of the line means over-represented.</p>
            {demo?.items.length ? <AgeSkew block={demo} /> : <p className="muted">Qloo has no age or gender data for these comps, so the plan doesn't claim a skew. The age panel still re-weights taste by age band.</p>}
            {demo?.items.length ? <button className="cite" style={{ marginTop: 14 }} onClick={() => setOpen(demo.id)}><b>{demo.id}</b><span>per-comp breakdown</span></button> : null}
          </div>
          {segments.length ? (
            <section className="card" aria-labelledby="h-seg">
              <h2 id="h-seg">One audience, different ages</h2>
              <p className="lede">The same comps, re-asked with signal.demographics.age so Qloo weights one age band of the fans.</p>
              <div className="stack">
                {segments.slice(0, 2).map((b) => (
                  <div key={b.id}>
                    <p className="small muted" style={{ marginBottom: 10 }}>{b.title} · {b.id}</p>
                    <AffinityBars items={b.items} onPick={setOpen} limit={5} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
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
        <h2 id="h-panel">Grounded audience simulations</h2>
        <p className="lede">{isBase ? 'Four imagined players, with nothing behind them.' : 'Four deliberately synthetic players built only from this report\'s aggregate Qloo evidence. They are not surveyed players, predictions about individuals or a substitute for playtesting.'}</p>
        <div className="grid4 panel-grid" style={{ gap: 20 }}>
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
          {!isBase && tags && !tags.items.length ? <p className="lede">Qloo returned no tags for these comps ({tags.id}), so the store tags are drafted from the other evidence.</p> : !isBase && tags ? (
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
          <p className="lede">
            Every Qloo call the agent made. The plan above cites these by ID
            {run.meta.citations ? `: ${run.meta.citations.item} citations point at one item, ${run.meta.citations.block} at a whole result` : ''}.
            {nums?.checked ? ` ${nums.matched} of ${nums.checked} numbers in the plan match their evidence.` : ''}
            {failed.length ? ` ${failed.length} call${failed.length === 1 ? '' : 's'} failed and ${failed.length === 1 ? 'is' : 'are'} listed at the end.` : ''}
          </p>
          {nums?.unmatched?.length ? <p className="small muted" style={{ marginBottom: 12 }}>Not matched: {nums.unmatched.slice(0, 6).map((u) => `${u.value} (${u.where})`).join(', ')}</p> : null}
          <div className="table-wrap"><table className="ledger">
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
              {failed.map((c, i) => (
                <tr key={`f${i}`} className="failed">
                  <td><span className="pill unscored">failed</span></td>
                  <td>{c.tool.replace(/_/g, ' ')}{c.input ? <span className="muted"> · {Object.values(c.input).flat().join(', ').slice(0, 60)}</span> : null}<div className="small muted">{c.error!.slice(0, 100)}</div></td>
                  <td className="small muted">-</td>
                  <td className="n">0</td>
                  <td className="n">-</td>
                </tr>
              ))}
            </tbody>
          </table></div>
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
        {['list', 'segment', 'tags'].includes(block.kind) && <p className="small muted">Affinity is Qloo's relative score inside this result set, not a probability or a share of players.</p>}
        {block.kind === 'demographics' ? (
          <table>
            <thead><tr><th>Comp</th>{Object.keys(block.items[0]?.age || {}).map((k) => <th key={k} className="n">{k.replace(/_/g, ' ').replace('and ', '')}</th>)}</tr></thead>
            <tbody>{block.items.map((i) => <tr key={i.id} className={i.id === refId ? 'hit' : ''}><td>{i.name}</td>{Object.values(i.age || {}).map((v, k) => <td key={k} className="n">{n(v)}</td>)}</tr>)}</tbody>
          </table>
        ) : block.kind === 'trending' ? (
          <table>
            <thead><tr><th>Pick</th><th className="n">Percentile</th><th className="n">Change</th><th className="n">Points</th></tr></thead>
            <tbody>{block.items.map((i) => <tr key={i.id} className={i.id === refId ? 'hit' : ''}><td>{i.name}<div className="small muted">{i.domain?.replace('_', ' ')} from {i.source}{i.from ? `, ${i.from} to ${i.to}` : ', no data'}</div></td><td className="n">{n(i.percentile)}</td><td className="n">{i.change == null ? '-' : (i.change > 0 ? '+' : '') + i.change.toFixed(3)}</td><td className="n">{i.series?.length ?? 0}</td></tr>)}</tbody>
          </table>
        ) : block.kind === 'compare' ? (
          <table>
            <thead><tr><th>Tag</th><th>Side</th><th className="n">Similarity</th></tr></thead>
            <tbody>{block.items.map((i) => <tr key={i.id} className={i.id === refId ? 'hit' : ''}><td>{i.name}<div className="small muted">{i.kind}</div></td><td>{i.side}</td><td className="n">{n(i.score)}</td></tr>)}</tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>{block.kind === 'heatmap' ? 'Place' : 'Name'}</th><th className="n">Affinity</th>{block.kind !== 'tags' && <th className="n">Popularity</th>}</tr></thead>
            <tbody>{block.items.map((i) => <tr key={i.id} className={i.id === refId ? 'hit' : ''}><td><span className="muted small num">{i.id}</span> {i.name}{i.tags?.length ? <div className="small muted">{i.tags.join(', ')}</div> : null}{i.status && i.status !== 'scored' ? <div className="small muted">{i.status}</div> : null}{i.niche ? <span className="pill niche">niche fit</span> : null}</td><td className="n">{n(i.affinity)}</td>{block.kind !== 'tags' && <td className="n">{n(i.popularity)}</td>}</tr>)}</tbody>
          </table>
        )}
        <div className="params"><p style={{ marginBottom: 4 }}>The Qloo request behind it</p><code>GET {block.endpoint}?{query}</code></div>
      </div>
    </aside>
  )
}
