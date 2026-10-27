// Fetches upcoming match-result and over/under 2.5 odds from The Odds API
// and writes a consensus (median across UK bookmakers) to odds.json.
//
// Needs the ODDS_API_KEY environment variable (a GitHub Actions secret).
// Cost per run: 2 credits (h2h + totals, one region) per league.

import { writeFile, readFile } from "node:fs/promises";

// Fallback list, used only if the competitions list can't be loaded.
// Normally the script asks the API which English and Scottish competitions
// are active (Carabao Cup, FA Cup and Scottish cups included) — that call is free.
const COMPETITION_KEY = /^soccer_(epl|efl|england|fa_cup|spl|scotland)/;
const FALLBACK_LEAGUES = [
  { key: "soccer_epl", name: "Premier League" },
  { key: "soccer_efl_champ", name: "Championship" },
  { key: "soccer_england_league1", name: "League One" },
  { key: "soccer_england_league2", name: "League Two" },
  { key: "soccer_spl", name: "Scottish Premiership" },
  { key: "soccer_fa_cup", name: "FA Cup" },
];
const NAMES = Object.fromEntries(FALLBACK_LEAGUES.map(l => [l.key, l.name]));
NAMES.soccer_england_efl_cup = "Carabao Cup";
const DAYS_AHEAD = 10;
const OUT = new URL("../odds.json", import.meta.url);

const key = process.env.ODDS_API_KEY;
const mockDir = process.env.ODDS_MOCK_DIR; // local testing only
if (!key && !mockDir) {
  console.error("ODDS_API_KEY is not set. Add it under Settings > Secrets and variables > Actions.");
  process.exit(1);
}

const median = xs => {
  const s = xs.filter(x => Number.isFinite(x) && x > 1).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = x => (x == null ? "" : x.toFixed(2));

async function getLeague(league) {
  if (mockDir) {
    try { return { events: JSON.parse(await readFile(`${mockDir}/${league.key}.json`, "utf8")), remaining: "mock" }; }
    catch { return { events: [], remaining: "mock" }; }
  }
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${league.key}/odds`);
  url.search = new URLSearchParams({
    apiKey: key, regions: "uk", markets: "h2h,totals", oddsFormat: "decimal", dateFormat: "iso",
  }).toString();
  const res = await fetch(url);
  const remaining = res.headers.get("x-requests-remaining");
  if (res.status === 401) {
    console.error("The Odds API rejected the key (401). Check the ODDS_API_KEY secret.");
    process.exit(1);
  }
  if (res.status === 429) {
    console.error("Out of API credits or rate limited (429).");
    process.exit(1);
  }
  if (!res.ok) {
    console.warn(`Skipping ${league.name}: HTTP ${res.status} ${await res.text()}`);
    return { events: [], remaining };
  }
  return { events: await res.json(), remaining };
}

function summarise(ev, league) {
  const h = [], d = [], a = [], o = [], u = [];
  for (const bk of ev.bookmakers || []) {
    for (const mk of bk.markets || []) {
      if (mk.key === "h2h") {
        for (const oc of mk.outcomes) {
          if (oc.name === ev.home_team) h.push(oc.price);
          else if (oc.name === ev.away_team) a.push(oc.price);
          else if (oc.name === "Draw") d.push(oc.price);
        }
      } else if (mk.key === "totals") {
        for (const oc of mk.outcomes) {
          if (oc.point !== 2.5) continue;
          if (oc.name === "Over") o.push(oc.price);
          else if (oc.name === "Under") u.push(oc.price);
        }
      }
    }
  }
  const mh = median(h), md = median(d), ma = median(a);
  if (!mh || !md || !ma) return null;
  const mo = median(o), mu = median(u);
  return {
    id: ev.id,
    league: league.name,
    kickoff: ev.commence_time,
    home: ev.home_team,
    away: ev.away_team,
    h: fmt(mh), d: fmt(md), a: fmt(ma),
    o: mo && mu ? fmt(mo) : "",
    u: mo && mu ? fmt(mu) : "",
    books: (ev.bookmakers || []).length,
  };
}

async function activeCompetitions() {
  if (mockDir) return FALLBACK_LEAGUES;
  try {
    const url = new URL("https://api.the-odds-api.com/v4/sports");
    url.search = new URLSearchParams({ apiKey: key }).toString();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = (await res.json())
      .filter(s => s.active && !s.has_outrights && COMPETITION_KEY.test(s.key))
      .map(s => ({ key: s.key, name: NAMES[s.key] || s.title }));
    if (!list.length) throw new Error("no matching competitions");
    return list;
  } catch (e) {
    console.warn(`Couldn't load the competitions list (${e.message}); using the fallback list.`);
    return FALLBACK_LEAGUES;
  }
}

const LEAGUES = await activeCompetitions();
console.log("Competitions:", LEAGUES.map(l => `${l.name} (${l.key})`).join(", "));
const now = Date.now();
const horizon = now + DAYS_AHEAD * 864e5;
const fixtures = [];
let remaining = null;
for (const league of LEAGUES) {
  const r = await getLeague(league);
  if (r.remaining != null) remaining = r.remaining;
  for (const ev of r.events) {
    const t = Date.parse(ev.commence_time);
    if (!(t > now && t < horizon)) continue;
    const f = summarise(ev, league);
    if (f) fixtures.push(f);
  }
}
fixtures.sort((x, y) => Date.parse(x.kickoff) - Date.parse(y.kickoff));

const out = {
  updated: new Date().toISOString(),
  creditsRemaining: remaining == null ? null : Number(remaining) || remaining,
  fixtures,
};
await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote ${fixtures.length} fixtures. Credits remaining: ${remaining}`);
