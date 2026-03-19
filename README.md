# Scoreboard

A personal sports scoreboard that pulls live scores, recent results, and upcoming fixtures from ESPN's API. Games are grouped by sport with live matches auto-refreshing every 30 seconds.

## Features

- **Live scores** — auto-refresh every 30s with a countdown timer
- **Recent results** — final scores frozen on load, not re-fetched on refresh
- **Upcoming fixtures** — next day's scheduled games
- **Sport sections** — results grouped by sport (Soccer, Basketball, Tennis…)
- **Configurable leagues** — enable/disable leagues via a settings page
- **Team/player filters** — filter any league to a specific team or player (supports nationality for tennis, e.g. "Argentina")

## Supported Leagues

| Sport | Leagues |
|-------|---------|
| Soccer | EPL, La Liga, Bundesliga, MLS, Champions League, Serie A, Argentine Primera |
| Basketball | NBA |
| Tennis | ATP, WTA |

## Stack

- **Backend** — Node.js + Express, fetches from ESPN's public API
- **Frontend** — Vanilla JS, no framework
- **Cache** — In-memory TTL cache (60s) to avoid hammering the ESPN API

## Running locally

```bash
npm install
node server.js
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Designed for cPanel shared hosting with Node.js (Phusion Passenger).

- **Startup file:** `server.js`
- The app reads `PASSENGER_BASE_URI` automatically, so it works when hosted at a subdirectory (e.g. `https://example.com/seba`)

## Project structure

```
server.js           # Express entry point
routes/games.js     # /api/scoreboard and /api/upcoming endpoints
services/sportsService.js  # ESPN API fetching + normalization
cache/cache.js      # Simple in-memory TTL cache
config/             # Persisted league config (enabled leagues + team filters)
public/
  index.html        # Scoreboard page
  config.html       # Settings page
  app.js            # All frontend logic
  styles.css        # Styles
```
