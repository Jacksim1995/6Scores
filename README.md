# Correct Score Picker

Picks scores for bet365 6 Scores (and season-long points games) from bookmaker odds.

The page turns match-result and over/under 2.5 odds into a probability for every scoreline using a Dixon-Coles goals model. It can then give you the single most likely ticket, or shuffle a random ticket weighted by the odds, with options for underdog wins, avoiding popular scores, and limiting repeated scores.

A scheduled GitHub Action pulls the week's odds from [The Odds API](https://the-odds-api.com) into `odds.json`, so the fixtures appear in the app ready to pick.

## Setup (one time)

1. **Get a free API key** at [the-odds-api.com](https://the-odds-api.com). The free plan gives 500 credits a month; each refresh uses 2 credits per league (about 12), and it runs four times a week.
2. **Add the key as a secret**: repo **Settings → Secrets and variables → Actions → New repository secret**. Name it `ODDS_API_KEY` and paste the key.
3. **Turn on Pages**: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Run it once**: **Actions → Fetch odds and deploy → Run workflow**.

The site is then at `https://<your-username>.github.io/<repo-name>/`. On iPhone, open it in Safari and use **Share → Add to Home Screen**.

## When the odds refresh

Tuesday 08:00, Thursday 18:00, Friday 18:00 and Saturday 08:00 (UTC). You can refresh any time from the Actions tab with **Run workflow**.

## Files

- `index.html` – the app. Your chosen fixtures and picks are saved in your browser only.
- `odds.json` – this week's fixtures and median UK bookmaker prices, written by the Action.
- `scripts/fetch-odds.mjs` – the fetch script. Each run it asks the API which English and Scottish competitions are active (leagues and cups) and pulls those. Edit `COMPETITION_KEY` to change that.
- `.github/workflows/odds.yml` – the schedule, fetch, and Pages deploy.
