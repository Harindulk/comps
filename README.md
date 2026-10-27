# Comps

**Launch plans for indie games, built from the games your players already love.**

Live: LIVE_URL · Licence: MIT

Every indie developer pitches their game the same way: "it's Crossy Road meets Subway Surfers". Those comparable games ("comps") already tell you who your players are. Comps takes your game and two to five comps, sends an agent to ask Qloo what those players love outside games, who they are, where they live and whether the comps are rising or fading, and writes a launch plan where every claim links back to the Qloo data it rests on.

I make and launch mobile and Steam games myself (StarFun Games). The three example reports are my own games: Drive Away, Diner Rush Tycoon and The Final Room.

## What you get

- **A cited launch plan.** Audience, trailer music, mood-board references, creators and podcasts to pitch, launch markets, timing and risks. Every claim carries evidence chips (`E3.2`). Click one to see the exact Qloo item, its affinity and popularity, which comp drove it (Qloo explainability) and the request that produced it.
- **Who and where.** The average age and gender skew of the comp audiences, and a world map of where comp fans over-index, both straight from Qloo.
- **A player panel.** Four players built from the cited demographic, geographic and taste data react to your pitch in their own words and say whether they would buy, wishlist or pass.
- **A store page draft** with tags taken from the taste tags the comps' fans over-index on.
- **With Qloo / Without Qloo.** The same model gets the same brief with no Qloo access, in parallel. One switch shows both plans. The version without Qloo is generic ("target casual mobile gamers aged 18-34") and cites nothing; the version with Qloo names specific artists, podcasts, shows and cities with the audience measure behind each.
- **An evidence ledger** listing every Qloo call, how many items came back and how often the plan cited them.

## How it works

```
Browser (Vite + React)
  │  POST /api/run  {game, pitch, comps[]}        ← comps picked with Qloo /search
  ▼
Vercel function (Node)  ── streams each step back as server-sent events
  ├─ Claude (claude-opus-5-5) tool-use loop, decides which Qloo calls to make
  │    audience_taste        /v2/insights  filter.type=urn:entity:{artist|podcast|tv_show|movie|book|brand|videogame|place}
  │                                         + feature.explainability (which comp drove each result)
  │    audience_tags         /v2/insights  filter.type=urn:tag
  │    audience_demographics /v2/insights  filter.type=urn:demographics
  │    audience_geography    /v2/insights  filter.type=urn:heatmap (+ filter.location.query to zoom in)
  │    compare_audiences     /v2/analysis/compare
  │    comp_momentum         /v2/trending
  │    submit_report         strict JSON schema; every claim lists evidence IDs
  ├─ every Qloo answer is filed as an evidence block (E1, E2…) with item IDs (E1.1, E1.2…)
  ├─ citations are checked server-side; IDs that point at nothing are dropped and counted
  └─ in parallel: the same model, same brief, no tools → the "Without Qloo" plan
```

The agent is not a fixed pipeline. It reads the first answers and decides what to ask next: if the global heatmap points at Brazil it zooms into Brazil; if two comps look different it runs a compare between them. A typical run makes 8 to 12 Qloo calls across six endpoint modes and reads 150 to 300 data points.

### Qloo endpoints used

| Endpoint | Used for |
| --- | --- |
| `GET /search` (`types=urn:entity:videogame`) | the comps picker, resolving game names to Qloo IDs |
| `GET /v2/insights` with `filter.type=urn:entity:*` and `feature.explainability=true` | cross-domain taste: music, podcasts, TV, movies, books, brands, other games, places |
| `GET /v2/insights` with `filter.type=urn:tag` | taste tags for store copy and positioning |
| `GET /v2/insights` with `filter.type=urn:demographics` | age-band and gender skew per comp |
| `GET /v2/insights` with `filter.type=urn:heatmap` (global and zoomed) | launch and localisation markets |
| `GET /v2/analysis/compare` | what separates one comp's audience from another's |
| `GET /v2/trending` | whether each comp is gaining or losing attention, for timing |

A gotcha for other entrants: game search and insights use `urn:entity:videogame`; `urn:entity:video_game` is rejected even though some docs show it.

## Run it locally

Needs Node 22+.

```bash
npm install
cp .env.example .env   # add QLOO_API_KEY and ANTHROPIC_API_KEY
npm run api            # API on :8787
npm run dev            # app on :5173, proxies /api
npm test
```

`npm run examples` rebuilds the three example reports into `public/examples/`. That folder is gitignored on purpose: Qloo's terms allow private caching but not publishing raw Qloo data in a public repository, so the reports are deployed with the app and never committed.

## Deploy

Vercel, free tier. `api/run.js` streams for up to 300 seconds. Set `QLOO_API_KEY` and `ANTHROPIC_API_KEY` as environment variables. `MAX_RUNS_PER_HOUR` (default 4 per IP) and `MAX_RUNS_PER_DAY` (default 60) cap live runs.

## Limits

- Qloo coverage of small indie titles is thin, so pick comps that are well known; your own game does not need to be in Qloo.
- The rate limits and the Qloo response cache live in memory per server instance.
- The player panel is built from aggregate data. The players are illustrations of the audience, not real people.
- A live run takes one to three minutes and costs about a dollar of Claude usage, which is why the examples exist.

## Licence

MIT. See [LICENSE](LICENSE).
