const https = require('https');
const cache = require('../cache/cache');

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const CACHE_TTL = 60;

const LEAGUE_META = {
  'football/nfl':        { name: 'NFL',         sport: 'Football',   emoji: '🏈' },
  'basketball/nba':      { name: 'NBA',         sport: 'Basketball', emoji: '🏀' },
  'baseball/mlb':        { name: 'MLB',         sport: 'Baseball',   emoji: '⚾' },
  'hockey/nhl':          { name: 'NHL',         sport: 'Hockey',     emoji: '🏒' },
  'soccer/eng.1':        { name: 'EPL',         sport: 'Soccer',     emoji: '⚽' },
  'soccer/esp.1':        { name: 'La Liga',     sport: 'Soccer',     emoji: '⚽' },
  'soccer/ger.1':        { name: 'Bundesliga',  sport: 'Soccer',     emoji: '⚽' },
  'soccer/usa.1':        { name: 'MLS',         sport: 'Soccer',     emoji: '⚽' },
  'soccer/uefa.champions':{ name: 'UCL',        sport: 'Soccer',     emoji: '⚽' },
  'soccer/arg.1':        { name: 'Liga Arg',    sport: 'Soccer',     emoji: '⚽' },
  'soccer/ita.1':        { name: 'Serie A',     sport: 'Soccer',     emoji: '⚽' },
  'tennis/atp':          { name: 'ATP',         sport: 'Tennis',     emoji: '🎾' },
  'tennis/wta':          { name: 'WTA',         sport: 'Tennis',     emoji: '🎾' },
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse error for ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function normalizeTeam(competitor) {
  const team = competitor.team || {};
  const record = (competitor.records || []).find(r => r.type === 'total') || competitor.records?.[0];
  return {
    id: team.id,
    name: team.displayName || team.name || '',
    abbreviation: team.abbreviation || '',
    logo: team.logo || '',
    color: team.color ? `#${team.color}` : '#333333',
    score: competitor.score || '0',
    record: record ? record.summary : '',
    winner: competitor.winner === true,
  };
}

function normalizeTennisPlayer(competitor) {
  const athlete = competitor.athlete || {};
  const linescores = competitor.linescores || [];
  const setsWon = linescores.filter(s => s.winner).length;
  return {
    id: athlete.id || competitor.id,
    name: athlete.shortName || athlete.displayName || '',
    abbreviation: '',
    logo: athlete.flag ? athlete.flag.href : '',
    color: '#333333',
    score: String(setsWon),
    record: '',
    winner: competitor.winner === true,
    linescores: linescores.map(s => s.value),
    country: athlete.flag?.alt || '',
  };
}

function normalizeTennisEvents(events, leaguePath) {
  const meta = LEAGUE_META[leaguePath] || { name: leaguePath, sport: 'Tennis', emoji: '🎾' };
  const isWTA = leaguePath === 'tennis/wta';
  const matches = [];

  for (const event of events) {
    const tournamentName = event.name || '';
    for (const grouping of (event.groupings || [])) {
      const drawName = grouping.grouping?.displayName || '';
      const slug = grouping.grouping?.slug || '';
      // ATP endpoint returns women's draws too (and vice versa) — filter to the right gender
      if (isWTA && slug.startsWith('mens')) continue;
      if (!isWTA && slug.startsWith('womens')) continue;
      for (const comp of (grouping.competitions || [])) {
        const status = comp.status || {};
        const statusType = status.type || {};
        const state = statusType.state || 'pre';
        const competitors = comp.competitors || [];
        const p1 = normalizeTennisPlayer(competitors[0] || {});
        const p2 = normalizeTennisPlayer(competitors[1] || {});

        let displayClock = '';
        if (state === 'in') {
          displayClock = status.period ? `Set ${status.period}` : 'In Progress';
        }

        matches.push({
          id: comp.id,
          league: leaguePath,
          leagueMeta: { ...meta, name: `${meta.name} · ${drawName}` },
          gameTime: comp.date || comp.startDate,
          displayTime: statusType.shortDetail || '',
          state,
          statusName: statusType.name || '',
          displayClock,
          home: p1,
          away: p2,
          venue: `${tournamentName}${comp.venue?.court ? ' · ' + comp.venue.court : ''}`,
          broadcasts: (comp.broadcasts || []).flatMap(b => b.names || []),
        });
      }
    }
  }

  return matches;
}

function normalizeEvents(events, leaguePath) {
  const meta = LEAGUE_META[leaguePath] || { name: leaguePath, sport: '', emoji: '🏆' };
  const isSoccer = leaguePath.startsWith('soccer/');

  return events.map((event) => {
    const competition = (event.competitions || [])[0] || {};
    const status = competition.status || {};
    const statusType = status.type || {};
    const competitors = competition.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
    const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
    const venue = (competition.venue || {});

    const state = statusType.state || 'pre';
    let displayClock = '';
    if (state === 'in') {
      if (isSoccer) {
        displayClock = `${status.displayClock || ''}'`;
      } else {
        const period = status.period || '';
        const clock = status.displayClock || '';
        displayClock = period ? `P${period} ${clock}` : clock;
      }
    }

    return {
      id: event.id,
      league: leaguePath,
      leagueMeta: meta,
      gameTime: event.date,
      displayTime: statusType.shortDetail || '',
      state,
      statusName: statusType.name || '',
      displayClock,
      home: normalizeTeam(home),
      away: normalizeTeam(away),
      venue: venue.fullName || '',
      broadcasts: (competition.broadcasts || []).flatMap(b => b.names || []),
    };
  });
}

function matchesTeamFilter(game, filter) {
  if (!filter) return true;
  const f = filter.toLowerCase();
  return [game.home.name, game.home.abbreviation, game.away.name, game.away.abbreviation,
          game.home.country, game.away.country]
    .filter(Boolean)
    .some(s => s.toLowerCase().includes(f));
}

async function fetchLeagueScoreboard(leaguePath, dateParam) {
  const cacheKey = `scoreboard:${leaguePath}:${dateParam || 'today'}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const dateQuery = dateParam ? `?dates=${dateParam}` : '';
  const url = `${ESPN_BASE}/${leaguePath}/scoreboard${dateQuery}`;
  const data = await fetchJson(url);
  const events = data.events || [];
  const normalized = leaguePath.startsWith('tennis/')
    ? normalizeTennisEvents(events, leaguePath)
    : normalizeEvents(events, leaguePath);
  cache.set(cacheKey, normalized, CACHE_TTL);
  return normalized;
}

const STATE_ORDER = { in: 0, post: 1, pre: 2 };

async function getScoreboard(enabledLeagues, teamFilters = {}) {
  const results = await Promise.allSettled(
    enabledLeagues.map(league => fetchLeagueScoreboard(league))
  );
  const games = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(g => matchesTeamFilter(g, teamFilters[g.league]));
  return games.sort((a, b) => {
    const stateDiff = (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3);
    if (stateDiff !== 0) return stateDiff;
    return new Date(a.gameTime) - new Date(b.gameTime);
  });
}

async function getUpcoming(enabledLeagues, teamFilters = {}) {
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + 7);
  const dateRange = `${toDateStr(today)}-${toDateStr(future)}`;

  const results = await Promise.allSettled(
    enabledLeagues.map(league => fetchLeagueScoreboard(league, dateRange))
  );
  const games = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(g => g.state === 'pre')
    .filter(g => matchesTeamFilter(g, teamFilters[g.league]));
  return games.sort((a, b) => new Date(a.gameTime) - new Date(b.gameTime));
}

module.exports = { getScoreboard, getUpcoming };
