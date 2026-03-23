/* ─── Shared constants ─── */
const ALL_LEAGUES = [
  { path: 'soccer/eng.1',          name: 'EPL',        sport: 'Premier League',    emoji: '⚽' },
  { path: 'soccer/esp.1',          name: 'La Liga',    sport: 'La Liga',           emoji: '⚽' },
  { path: 'soccer/ger.1',          name: 'Bundesliga', sport: 'Bundesliga',        emoji: '⚽' },
  { path: 'soccer/usa.1',          name: 'MLS',        sport: 'MLS',               emoji: '⚽' },
  { path: 'soccer/uefa.champions', name: 'UCL',        sport: 'Champions League',  emoji: '⚽' },
  { path: 'soccer/arg.1',          name: 'Liga Arg',   sport: 'Argentine Primera', emoji: '⚽' },
  { path: 'soccer/ita.1',          name: 'Serie A',    sport: 'Serie A',           emoji: '⚽' },
  { path: 'basketball/nba',        name: 'NBA',        sport: 'Basketball',        emoji: '🏀' },
  { path: 'tennis/atp',            name: 'ATP',        sport: 'Tennis (Men)',      emoji: '🎾' },
  { path: 'tennis/wta',            name: 'WTA',        sport: 'Tennis (Women)',    emoji: '🎾' },
];

/* ─── Page detection ─── */
const isConfig = document.querySelector('#config-grid') !== null;
const isScoreboard = document.querySelector('#sports-container') !== null;

/* ─────────────────────────────────────────────────────────────
   SCOREBOARD PAGE
───────────────────────────────────────────────────────────── */
if (isScoreboard) (function () {
  var countdownValue = 30;
  var countdownTimer = null;
  var refreshTimer = null;
  var recentRendered = false;
  var recentGamesBySport = {};

  const SPORT_PRIORITY = ['Soccer', 'Football', 'Basketball', 'Baseball', 'Hockey', 'Tennis'];

  function sportSortKey(sport) {
    const idx = SPORT_PRIORITY.indexOf(sport);
    return idx === -1 ? String(SPORT_PRIORITY.length) + sport : String(idx).padStart(3, '0');
  }

  function groupBySport(games) {
    return games.reduce((map, g) => {
      const s = g.leagueMeta.sport;
      (map[s] = map[s] || []).push(g);
      return map;
    }, {});
  }

  function sportSlug(sport) {
    return sport.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function ensureSportSection(sport, emoji) {
    const slug = sportSlug(sport);
    let section = document.getElementById(`sport-section-${slug}`);
    if (section) return section;
    section = document.createElement('div');
    section.className = 'sport-section';
    section.id = `sport-section-${slug}`;
    section.innerHTML = `
      <div class="sport-section-header">
        <span class="sport-emoji">${emoji}</span>
        <span class="sport-title">${sport}</span>
      </div>
      <div id="sport-${slug}-live-wrapper" class="sport-live-wrapper">
        <div class="subsection-header">
          <span class="subsection-label live-label"><span class="live-dot"></span>Live</span>
        </div>
        <div class="game-grid" id="sport-${slug}-live-grid"></div>
      </div>
      <div id="sport-${slug}-recent-wrapper" class="sport-recent-wrapper">
        <div class="subsection-header">
          <span class="subsection-label">Recent</span>
        </div>
        <div class="game-grid" id="sport-${slug}-recent-grid"></div>
      </div>`;
    document.getElementById('sports-container').appendChild(section);
    return section;
  }

  function renderSportsSections(liveGames, recentGames) {
    const isFirstRender = !recentRendered;
    if (isFirstRender) {
      recentGamesBySport = groupBySport(recentGames);
      recentRendered = true;
    }

    const liveByS = groupBySport(liveGames);
    const allSports = [...new Set([...Object.keys(liveByS), ...Object.keys(recentGamesBySport)])]
      .sort((a, b) => sportSortKey(a).localeCompare(sportSortKey(b)));

    for (const sport of allSports) {
      const firstGame = (liveByS[sport] || [])[0] || (recentGamesBySport[sport] || [])[0];
      const emoji = firstGame.leagueMeta.emoji;
      ensureSportSection(sport, emoji);
      const slug = sportSlug(sport);

      const liveWrapper = document.getElementById(`sport-${slug}-live-wrapper`);
      const liveGrid = document.getElementById(`sport-${slug}-live-grid`);
      const liveGamesForSport = liveByS[sport] || [];
      if (liveGamesForSport.length > 0) {
        liveGrid.innerHTML = liveGamesForSport.map(renderGameCard).join('');
        liveWrapper.style.display = '';
      } else {
        liveWrapper.style.display = 'none';
      }

      if (isFirstRender) {
        const recentWrapper = document.getElementById(`sport-${slug}-recent-wrapper`);
        const recentGrid = document.getElementById(`sport-${slug}-recent-grid`);
        const recentGamesForSport = recentGamesBySport[sport] || [];
        if (recentGamesForSport.length > 0) {
          recentGrid.innerHTML = recentGamesForSport.map(renderGameCard).join('');
          recentWrapper.style.display = '';
        } else {
          recentWrapper.style.display = 'none';
        }
      }
    }
  }

  function updateCountdownVisibility(hasLive) {
    document.querySelector('.refresh-timer').style.display = hasLive ? '' : 'none';
  }

  function statusDisplay(game) {
    if (game.state === 'in') {
      return `<span class="status-label live"><span class="live-dot"></span>${game.displayClock || 'LIVE'}</span>`;
    }
    if (game.state === 'post') {
      return `<span class="status-label final">Final</span>`;
    }
    return `<span class="status-label scheduled">${game.displayTime || 'Scheduled'}</span>`;
  }

  function buildTeamRow(team, state) {
    const cls = state === 'post' ? (team.winner ? 'winner' : 'loser') : '';
    const logoHtml = team.logo
      ? `<img class="team-logo" src="${team.logo}" alt="" onerror="this.style.display='none'">`
      : `<div class="team-logo"></div>`;
    const showScore = state === 'in' || state === 'post';
    // For tennis: show set scores inline (e.g. "6 1 6") instead of sets-won count
    const scoreHtml = showScore
      ? (team.linescores && team.linescores.length
          ? `<div class="team-score tennis-sets">${team.linescores.join('<span class="set-sep"> </span>')}</div>`
          : `<div class="team-score">${team.score}</div>`)
      : '';
    return `
      <div class="team-row ${cls}">
        ${logoHtml}
        <div class="team-info">
          <div class="team-name">${team.name}</div>
          ${team.record ? `<div class="team-record">${team.record}</div>` : ''}
        </div>
        ${scoreHtml}
      </div>`;
  }

  function renderGameCard(game) {
    const liveClass = game.state === 'in' ? 'live' : '';
    const broadcastHtml = game.broadcasts && game.broadcasts.length
      ? `<div class="broadcasts">${game.broadcasts.join(' · ')}</div>`
      : '';
    return `
      <div class="game-card ${liveClass}">
        <div class="league-badge">${game.leagueMeta.emoji} ${game.leagueMeta.name}</div>
        <div class="status-bar">
          ${statusDisplay(game)}
          ${game.venue ? `<span style="font-size:11px;color:var(--text-muted)">${game.venue}</span>` : ''}
        </div>
        <div class="teams">
          ${buildTeamRow(game.away, game.state)}
          ${buildTeamRow(game.home, game.state)}
        </div>
        ${broadcastHtml}
      </div>`;
  }

  function dayLabel(isoString) {
    const date = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const toKey = d => d.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateKey = toKey(date);

    if (dateKey === toKey(today)) return 'Today';
    if (dateKey === toKey(tomorrow)) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric' });
  }

  function renderUpcoming(games) {
    const container = document.getElementById('upcoming-container');
    const count = document.getElementById('upcoming-count');
    if (games.length === 0) {
      count.textContent = 0;
      container.innerHTML = '<div class="empty-state">No upcoming games.</div>';
      return;
    }
    const groups = {};
    const order = [];
    games.forEach(game => {
      const label = dayLabel(game.gameTime);
      if (!groups[label]) { groups[label] = []; order.push(label); }
      groups[label].push(game);
    });
    const firstDay = order[0];
    const firstDayGames = groups[firstDay];
    count.textContent = firstDayGames.length;
    container.innerHTML = `
      <div class="date-group">
        <div class="date-label">${firstDay}</div>
        <div class="game-grid">
          ${firstDayGames.map(renderGameCard).join('')}
        </div>
      </div>`;
  }

  async function loadData() {
    try {
      const [scoreboard, upcoming] = await Promise.all([
        fetch('api/scoreboard').then(r => r.json()),
        fetch('api/upcoming').then(r => r.json()),
      ]);
      const games = Array.isArray(scoreboard) ? scoreboard : [];
      const liveGames = games.filter(g => g.state === 'in');
      const recentGames = games.filter(g => g.state === 'post');
      renderSportsSections(liveGames, recentGames);
      updateCountdownVisibility(liveGames.length > 0);
      renderUpcoming(Array.isArray(upcoming) ? upcoming : []);
    } catch (err) {
      document.getElementById('sports-container').innerHTML =
        `<div class="error-msg">Error loading scores: ${err.message}</div>`;
    }
  }

  function startCountdown() {
    countdownValue = 30;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      countdownValue -= 1;
      const el = document.getElementById('countdown');
      if (el) el.textContent = countdownValue;
      if (countdownValue <= 0) clearInterval(countdownTimer);
    }, 1000);
  }

  async function refresh() {
    await loadData();
    startCountdown();
  }

  refresh();
  refreshTimer = setInterval(refresh, 30000);

  // Re-fetch immediately when the user returns to this tab (e.g. after changing settings)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      recentRendered = false;
      recentGamesBySport = {};
      document.querySelectorAll('.sport-section').forEach(el => el.remove());
      clearInterval(refreshTimer);
      refresh();
      refreshTimer = setInterval(refresh, 30000);
    }
  });
})();

/* ─────────────────────────────────────────────────────────────
   CONFIG PAGE
───────────────────────────────────────────────────────────── */
if (isConfig) (function () {
  var saveTimer = null;
  var enabledSet = new Set();
  var teamFilters = {};  // { 'soccer/usa.1': 'Inter Miami', ... }
  var recentDays = 2;

  function showToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  async function saveConfig() {
    // Strip blank filter values before saving
    const cleanFilters = {};
    for (const [k, v] of Object.entries(teamFilters)) {
      if (v && v.trim()) cleanFilters[k] = v.trim();
    }
    try {
      const res = await fetch('api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledLeagues: [...enabledSet], teamFilters: cleanFilters, recentDays }),
      });
      if (res.ok) {
        showToast();
      } else {
        console.error('Save failed: server returned', res.status);
      }
    } catch (err) {
      console.error('Save failed:', err);
    }
  }

  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveConfig, 300);
  }

  function renderConfig() {
    const grid = document.getElementById('config-grid');
    grid.innerHTML = ALL_LEAGUES.map(league => {
      const active = enabledSet.has(league.path);
      const filterValue = teamFilters[league.path] || '';
      return `
        <div class="league-card ${active ? 'active' : ''}" data-path="${league.path}">
          <div class="league-card-top">
            <div class="league-card-info">
              <span class="league-emoji">${league.emoji}</span>
              <div class="league-names">
                <span class="league-short">${league.name}</span>
                <span class="league-long">${league.sport}</span>
              </div>
            </div>
            <label class="toggle">
              <input type="checkbox" class="league-toggle" ${active ? 'checked' : ''} data-path="${league.path}">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="team-filter-row ${active ? '' : 'hidden'}">
            <input
              type="text"
              class="team-filter-input"
              data-path="${league.path}"
              placeholder="Filter to team (e.g. Inter Miami)"
              value="${filterValue}"
            >
          </div>
        </div>`;
    }).join('');

    // Toggle checkboxes
    grid.querySelectorAll('input.league-toggle').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const path = e.target.dataset.path;
        if (e.target.checked) {
          enabledSet.add(path);
        } else {
          enabledSet.delete(path);
        }
        const card = grid.querySelector(`.league-card[data-path="${path}"]`);
        if (card) {
          card.classList.toggle('active', e.target.checked);
          card.querySelector('.team-filter-row').classList.toggle('hidden', !e.target.checked);
        }
        debouncedSave();
      });
    });

    // Team filter inputs
    grid.querySelectorAll('input.team-filter-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const path = e.target.dataset.path;
        teamFilters[path] = e.target.value;
        debouncedSave();
      });
      // Prevent card clicks from propagating when typing
      input.addEventListener('click', e => e.stopPropagation());
    });
  }

  async function loadConfig() {
    try {
      const config = await fetch('api/config').then(r => r.json());
      enabledSet = new Set(config.enabledLeagues || []);
      teamFilters = config.teamFilters || {};
      recentDays = (Number.isInteger(config.recentDays) && config.recentDays >= 1) ? config.recentDays : 2;
    } catch (_) {
      enabledSet = new Set(ALL_LEAGUES.map(l => l.path));
      teamFilters = {};
      recentDays = 2;
    }
    document.getElementById('recent-days-input').value = recentDays;
    renderConfig();
  }

  document.getElementById('recent-days-input').addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (val >= 1) {
      recentDays = val;
      debouncedSave();
    }
  });

  loadConfig();
})();
