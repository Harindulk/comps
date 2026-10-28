# Comps

**Launch intelligence for indie games: your comps know who will love your game, and Comps shows you where to find them.**

Live: https://comps-qloo.vercel.app · Licence: MIT

Every indie game gets pitched the same way: "it's Phasmophobia meets Lethal Company". Those comparable games ("comps") already point at your players, but they only tell you what those players like in games. Comps sends an agent into Qloo's taste graph to find out what those players love outside games, who they skew towards and where their taste concentrates. Then it writes a launch plan where every claim links back to the Qloo result behind it.

I make and launch mobile and Steam games myself (StarFun Games, Sri Lanka). The example reports are my own games: The Final Room, Drive Away and Diner Rush Tycoon.

## Try it in 30 seconds

1. Open https://comps-qloo.vercel.app and click the example. It loads instantly, with no sign-up.
2. Read "Your launch in three decisions", then click any blue evidence chip. The drawer shows the Qloo item, its affinity, which comp drove it and the exact request.
3. Flip **Without Qloo** at the top. That's the same model with the same brief and no Qloo data. Compare.
4. Run your own: name your game, add two to five comps from the search box and, if you like, the podcasts or creators you were planning to pitch. A run takes one to three minutes, and you watch each Qloo call as it happens.

## What you get

- **Three decisions first:** who the game is for, the strongest cultural hook outside games, and where to start. Each one is cited.
- **A cited launch plan:** audience, trailer music, mood board, creators and podcasts to pitch, markets, timing and risks. Every claim carries evidence chips (`E3.2`). The server drops any citation that doesn't point at real evidence.
- **Pitch check:** the names you were going to pitch, scored by Qloo against your comps' players (`filter.results.entities`), with a keep, test or drop verdict for each. Names Qloo can't find are listed, never hidden.
- **One audience, different ages:** the same taste question re-asked for one age band at a time (`signal.demographics.age`), because the trailer brief for 24-and-unders isn't the one for 35-44s.
- **Who and where:** the comps' age and gender skew, when Qloo has it, and a map of where the taste concentrates.
- **Grounded audience simulations:** four deliberately synthetic players built only from the report's aggregate evidence, reacting to the pitch. They are labelled as simulations, not players or predictions.
- **With Qloo / Without Qloo:** the same model runs the same brief without Qloo, in parallel, so you can see what the data changed.
- **An evidence ledger:** every Qloo call the agent made, how many items came back and how often the plan cited each one.

## How it works

```
Browser (Vite + React)
  │  POST /api/run  {game, pitch, comps[], shortlist[]}     ← comps picked with Qloo /search
  ▼
Vercel function (Node)  ── streams each step back as server-sent events
  ├─ Claude (claude-opus-5-5) tool-use loop; it decides which Qloo calls to make
  │    audience_taste        /v2/insights  filter.type=urn:entity:{artist|podcast|tv_show|movie|book|brand|videogame}
  │                                         + feature.explainability (which comp drove each result)
  │    pitch_check           /search, then /v2/insights + filter.results.entities (score the developer's shortlist)
  │    audience_segment      /v2/insights + signal.demographics.age (taste for one age band)
  │    audience_tags         /v2/insights  filter.type=urn:tag (+ filter.parents.types=urn:entity:videogame)
  │    audience_demographics /v2/insights  filter.type=urn:demographics
  │    audience_geography    /v2/insights  filter.type=urn:heatmap + filter.location.query=<country or city>
  │    compare_audiences     /v2/analysis/compare (taste tags two comps share, and the ones unique to each)
  │    check_momentum        /v2/trending on the artists and podcasts it already found
  │    submit_report         strict JSON schema; every claim lists evidence IDs
  ├─ every Qloo answer is filed as an evidence block (E1, E2…) with item IDs (E1.1, E1.2…)
  ├─ citations are checked server-side; IDs that point at nothing are dropped and counted
  └─ in parallel: the same model, same brief, no tools → the "Without Qloo" plan
```

The agent isn't a fixed pipeline. It reads the first answers and decides what to ask next: which countries to map, which age band to re-ask for, which two comps to compare, and which artists and podcasts are worth a momentum check before it recommends them. A typical run makes 10 to 14 Qloo calls, with a hard cap of 18.

### Qloo endpoints and parameters

| Endpoint | Used for |
| --- | --- |
| `GET /search` (`types=urn:entity:videogame`) | the comps picker, and resolving shortlist names |
| `GET /v2/insights`, `filter.type=urn:entity:*`, `feature.explainability=true` | cross-domain taste: music, podcasts, TV, movies, books, brands and other games, with which comp drove each result |
| `GET /v2/insights` + `filter.results.entities` | scoring the developer's own shortlist against the comps' audience |
| `GET /v2/insights` + `signal.demographics.age` | taste re-weighted for one age band |
| `GET /v2/insights`, `filter.type=urn:tag` | game tags (scoped with `filter.parents.types`) for the store page; all tags as a fallback |
| `GET /v2/insights`, `filter.type=urn:demographics` | age-band and gender skew per comp |
| `GET /v2/insights`, `filter.type=urn:heatmap` + `filter.location.query` | where inside a country the taste concentrates |
| `GET /v2/analysis/compare` | taste tags two comps share and the ones unique to each |
| `GET /v2/trending` | whether a recommended artist or podcast is rising or fading |

### Reading the numbers honestly

- Affinity is Qloo's relative score inside one result set. Comps never presents it as a probability, a share of players or a sales estimate.
- The heatmap shows where a taste concentrates, not where sales will happen.
- `/v2/analysis/compare` compares taste-tag profiles. Comps doesn't call it audience overlap.
- Demographic skews describe aggregates. When Qloo has no demographic data for the comps, the report says so instead of guessing.
- The audience simulations are synthetic, and every trait in them cites its evidence.

### Notes for other entrants, from the live hackathon API

- Game search and insights use `urn:entity:videogame`; `urn:entity:video_game` is rejected even though some docs show it.
- Heatmaps need `filter.location.query` (a country or city; continents fail) and can return thousands of cells, so rank and trim them. Named-locality output (`output.heatmap.boundary=urn:entity:locality`) came back saturated near affinity 1 across thousands of US localities in testing, so Comps keeps geohash cells ranked by affinity × popularity.
- `/v2/trending` takes exactly one signal entity of the same type as `filter.type`, and doesn't accept video games.
- `/v2/analysis/compare` on games returns tags (`results.tags`, `results.a`, `results.b`), not entities.
- Some games have taste data but no demographics or tags (Phasmophobia, Lethal Company and Content Warning, for example). `signal.demographics.age` still works for them.
- Coverage of mobile games is patchy: Crossy Road and Cooking Fever are missing, while Subway Surfers and Temple Run are there.
- Search ranks loosely, so match shortlist names exactly before trusting a hit.
- The gateway returns the occasional 502; one retry fixes it.

## Run it locally

Needs Node 22+.

```bash
npm install
cp .env.example .env   # add QLOO_API_KEY and ANTHROPIC_API_KEY
npm run api            # API on :8787
npm run dev            # app on :5173, proxies /api
npm test
```

`npm run examples` rebuilds the example reports into `public/examples/`. That folder is gitignored on purpose: Qloo allows private caching but not publishing its data in a public repository, so the reports are deployed with the app and never committed.

## Deploy and safety

Vercel, free tier. `api/run.js` streams for up to 300 seconds. Environment variables:

- `QLOO_API_KEY` and `ANTHROPIC_API_KEY`;
- `MAX_RUNS_PER_HOUR` per IP (default 4) and `MAX_RUNS_PER_DAY` (default 60);
- `LIVE_RUNS=off`, which pauses live runs while the examples keep working.

Each run is capped at 12 model turns and 18 Qloo calls. Identical inputs return the cached report instantly. Keys never leave the server.

## Limits

- Qloo coverage of small indie titles is thin, so pick comps that are well known; your own game doesn't need to be in Qloo.
- Heatmap scores are relative inside each country, so the map shows where to target within a market, not which market is bigger.
- The rate limits and the Qloo response cache live in memory on each server instance.
- A live run takes one to three minutes and costs roughly a dollar of Claude usage, which is why the examples exist.
- No accounts, no saved reports beyond the JSON download.

## Licence

MIT. See [LICENSE](LICENSE).
