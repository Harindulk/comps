import { useEffect, useRef, useState } from 'react'
import type { Comp, Run, Step } from './types'
import { ReportView } from './Report'

type Example = { slug: string; game: string; with_hook?: string; without_hook?: string; own?: boolean; positioning: string; comps: Comp[]; calls: number; cited: number; claims: number }

function useExamples() {
  const [list, setList] = useState<Example[] | null>(null)
  useEffect(() => { fetch('/examples/index.json').then((r) => (r.ok ? r.json() : [])).then(setList).catch(() => setList([])) }, [])
  return list
}

function Picker({ value, onChange }: { value: Comp[]; onChange: (c: Comp[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Comp[]>([])
  const [active, setActive] = useState(0)
  const [err, setErr] = useState('')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (q.trim().length < 2) { setResults([]); return }
    timer.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then((x) => x.json())
        setErr(r.error ? 'Search is unavailable right now.' : '')
        setResults((r.results || []).filter((c: Comp) => !value.some((v) => v.id === c.id)))
        setActive(0)
      } catch { setErr('Search is unavailable right now.') }
    }, 220)
  }, [q, value])

  const add = (c: Comp) => { if (value.length < 5) onChange([...value, c]); setQ(''); setResults([]) }
  return (
    <div className="picker">
      <div className="picked" aria-live="polite">
        {value.map((c) => (
          <span key={c.id} className="chip">{c.name}{c.year ? ` (${c.year})` : ''}<button type="button" aria-label={`Remove ${c.name}`} onClick={() => onChange(value.filter((v) => v.id !== c.id))}>×</button></span>
        ))}
        {!value.length && <span className="hint">None picked yet. Pick two to five.</span>}
      </div>
      <input
        className="input" id="comp-search" value={q} onChange={(e) => setQ(e.target.value)} disabled={value.length >= 5}
        placeholder={value.length >= 5 ? 'Five is the limit' : 'Search Qloo for a game, e.g. Hades'}
        role="combobox" aria-expanded={results.length > 0} aria-controls="comp-menu" aria-autocomplete="list"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          if (e.key === 'Enter' && results[active]) { e.preventDefault(); add(results[active]) }
          if (e.key === 'Escape') setResults([])
        }}
      />
      {err && <p className="error" style={{ marginTop: 6 }}>{err}</p>}
      {results.length > 0 && (
        <ul className="menu" id="comp-menu" role="listbox">
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); add(c) }}>
              {c.image ? <img src={c.image} alt="" /> : <span className="thumb" />}
              <span style={{ flex: 1 }}>{c.name}</span>
              <span className="small muted">{c.year}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Home({ onRun, examples }: { onRun: (input: Run['input']) => void; examples: Example[] | null }) {
  const [name, setName] = useState('')
  const [pitch, setPitch] = useState('')
  const [comps, setComps] = useState<Comp[]>([])
  const [shortlist, setShortlist] = useState('')
  const ok = name.trim() && pitch.trim() && comps.length >= 2
  const hero = examples?.[0]
  return (
    <>
      <div className="hero">
        <div>
          <h1 className="hero-title">Your comps know who will love your game.</h1>
          <p className="sub" style={{ fontSize: 15, maxWidth: '62ch', color: 'var(--text)', marginTop: 10 }}>Comps shows you where to find them. Give it your game, a one-line pitch and two to five comparable games. An agent asks Qloo what those players love outside games, who they skew towards and where their taste concentrates, then writes a launch plan where every claim links to the Qloo result behind it.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            {hero && <a className="btn" href={`?example=${hero.slug}`}>Open {hero.game}{hero.own ? ', a real game' : ''} (instant)</a>}
            <a className="btn ghost" href="#new-plan">Analyse my game</a>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>No sign-up · every key claim traceable to Qloo · the same plan with and without taste data</p>
        </div>
        {hero?.with_hook && hero.without_hook && (
          <section className="card compare-card" aria-labelledby="h-diff">
            <h2 id="h-diff" className="muted" style={{ fontWeight: 500, fontSize: 13 }}>{hero.game}: the cultural hook. Same model, same brief.</h2>
            <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
              <div><p className="small muted">Without Qloo</p><p className="quote muted">{hero.without_hook}</p></div>
              <div><p className="small" style={{ color: 'var(--hue)' }}>With Qloo</p><p className="quote">{hero.with_hook}</p></div>
            </div>
          </section>
        )}
      </div>
      <div className="split">
        <form id="new-plan" className="card form" onSubmit={(e) => { e.preventDefault(); if (ok) onRun({ game: { name: name.trim(), pitch: pitch.trim() }, comps, shortlist: shortlist.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8) }) }}>
          <h2>New plan</h2>
          <label className="field">Your game<input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Drive Away" /></label>
          <label className="field">One-line pitch<textarea className="input" value={pitch} onChange={(e) => setPitch(e.target.value)} maxLength={500} placeholder="A one-thumb endless driving game: dodge traffic on a highway that never ends, earn new cars, chase your best distance." /></label>
          <div className="field" style={{ display: 'grid', gap: 6 }}>
            <label htmlFor="comp-search" className="small muted">Comparable games</label>
            <Picker value={comps} onChange={setComps} />
          </div>
          <label className="field">Who were you going to pitch? Optional<input className="input" value={shortlist} onChange={(e) => setShortlist(e.target.value)} maxLength={480} placeholder="Podcasts, streamers or artists, separated by commas" aria-describedby="shortlist-hint" /><span id="shortlist-hint" className="hint">Up to 8 names. Qloo scores each one against your comps' players.</span></label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" disabled={!ok}>Build the plan</button>
            <span className="hint">Takes one to three minutes.</span>
          </div>
        </form>
        <section className="card" aria-labelledby="h-ex">
          <h2 id="h-ex">Example reports</h2>
          <p className="lede">Finished runs you can open straight away.</p>
          {examples === null ? <p className="muted">Loading…</p> : examples.length === 0 ? <p className="muted">No examples on this server yet.</p> : (
            <ul className="rows">
              {examples.map((x) => (
                <li key={x.slug}>
                  <a href={`?example=${x.slug}`}>
                    <span className="rowtitle">{x.game}</span><span className="small muted num">{x.calls} Qloo calls · {x.cited}/{x.claims} cited</span>
                    <span style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
                      {x.comps.map((c) => <span key={c.id} className="tag" style={{ paddingLeft: c.image ? 3 : 10, gap: 8, height: 24 }}>{c.image && <img src={c.image} alt="" className="thumb" style={{ width: 18, height: 18, borderRadius: 9 }} />}{c.name}</span>)}
                    </span>
                    <span className="small" style={{ gridColumn: '1 / -1' }}>{x.positioning}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function Running({ input, steps, error, started }: { input: Run['input']; steps: Step[]; error: string; started: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const secs = Math.round((now - started) / 1000)
  return (
    <>
      <div className="titlerow">
        <div>
          <h1>Building the plan for {input.game.name}</h1>
          <p className="sub">Comps: {input.comps.map((c) => c.name).join(', ')} · <span className="num">{secs}s</span> elapsed</p>
        </div>
        <a className="btn ghost" href="./">Cancel</a>
      </div>
      <div className="split">
        <section className="card" aria-labelledby="h-trace" aria-live="polite">
          <h2 id="h-trace">What the agent is doing</h2>
          <p className="lede">Claude decides which Qloo calls to make. Each answer is filed as evidence the plan has to cite.</p>
          <ul className="trace">
            <li><span className="dot done" /><span>Read the brief and the {input.comps.length} comps</span><span /></li>
            {steps.map((s, i) => (
              <li key={i}><span className={`dot ${s.error ? 'err' : s.evidence ? 'done' : 'live'}`} /><span>{s.label}{s.error && <span className="error"> · {s.error}</span>}</span><span className="small muted num">{s.evidence}</span></li>
            ))}
            {!error && <li><span className="dot live" /><span className="muted">{steps.length ? 'Reading the evidence, deciding what to ask next' : 'Planning which questions to ask Qloo'}</span><span /></li>}
          </ul>
          {error && (
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <p className="error">{error}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><a className="btn" href="./">Open an example instead</a><a className="btn ghost" href="./#new-plan">Try again</a></div>
            </div>
          )}
        </section>
        <section className="card" aria-labelledby="h-meanwhile">
          <h2 id="h-meanwhile">Meanwhile</h2>
          <p className="lede">A second run of the same model gets the same brief with no Qloo access. When both finish, the report has a With Qloo / Without Qloo switch so you can see what the data changed.</p>
          <p className="small muted">Evidence so far: <span className="num">{steps.filter((s) => s.evidence).length}</span> Qloo answers.</p>
        </section>
      </div>
    </>
  )
}

export default function App() {
  const examples = useExamples()
  const [run, setRun] = useState<Run | null>(null)
  const [live, setLive] = useState<{ input: Run['input']; steps: Step[]; error: string; started: number } | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const slug = new URLSearchParams(location.search).get('example')

  useEffect(() => {
    if (!slug) return
    fetch(`/examples/${encodeURIComponent(slug)}.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setRun).catch(() => setLoadErr('That example could not be loaded.'))
  }, [slug])

  async function start(input: Run['input']) {
    setLive({ input, steps: [], error: '', started: Date.now() })
    const fail = (error: string) => setLive((l) => l && { ...l, error })
    try {
      const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      if (!res.ok || !res.body) return fail((await res.json().catch(() => ({}))).error || `The server answered ${res.status}.`)
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += value
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''
        for (const p of parts) {
          if (!p.startsWith('data: ')) continue
          const msg = JSON.parse(p.slice(6))
          if (msg.type === 'step') setLive((l) => l && { ...l, steps: [...l.steps, { tool: msg.tool, label: msg.label }] })
          if (msg.type === 'evidence') setLive((l) => {
            if (!l) return l
            const steps = [...l.steps]
            const i = steps.findIndex((s) => !s.evidence && !s.error && s.tool === msg.tool)
            if (i >= 0) steps[i] = { ...steps[i], evidence: msg.block.id }
            return { ...l, steps }
          })
          if (msg.type === 'step_error') setLive((l) => {
            if (!l) return l
            const steps = [...l.steps]
            const i = steps.findIndex((s) => !s.evidence && !s.error && s.tool === msg.tool)
            if (i >= 0) steps[i] = { ...steps[i], error: 'Qloo returned no data' }
            return { ...l, steps }
          })
          if (msg.type === 'error') fail(msg.error)
          if (msg.type === 'report') { const { type: _t, ...r } = msg; void _t; setRun(r); setLive(null); window.scrollTo(0, 0) }
        }
      }
    } catch (e) {
      fail(`The connection dropped: ${(e as Error).message}`)
    }
  }

  const download = () => {
    if (!run) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }))
    a.download = `${run.input.game.name.toLowerCase().replace(/\W+/g, '-')}-comps.json`
    a.click()
  }

  return (
    <>
      <header className="bar">
        <a className="brand" href="./"><img src="/mark.svg" alt="" />Comps</a>
        <span className="small muted hide-sm">launch intelligence for indie games, backed by Qloo</span>
        <span className="grow" />
        <nav>
          {run && <button className="btn quiet hide-sm" onClick={download}>Download JSON</button>}
          {(run || slug) && <a className="btn ghost" href="./">New plan</a>}
        </nav>
      </header>
      <main className="page">
        {loadErr ? <p className="error">{loadErr} <a href="./">Back</a></p>
          : run ? <ReportView run={run} />
          : live ? <Running {...live} />
          : slug ? <p className="muted">Loading the report…</p>
          : <Home onRun={start} examples={examples} />}
      </main>
      <footer className="foot">Comps by StarFun Games · taste data from the <a href="https://www.qloo.com/">Qloo</a> Insights API · plans written by Claude · <a href="https://github.com/Harindulk/comps">source</a></footer>
    </>
  )
}
