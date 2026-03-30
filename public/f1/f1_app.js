'use strict';

// ─── State ─────────────────────────────────────────────────────────────────
const state = {
  meetings: [],      // GP meetings sorted by date
  sessions: [],      // all 2026 sessions
  activeTab: 'race', // 'race' | 'qualifying'
  selectedKey: null, // meeting_key of selected GP
  liveTimer: null,   // setInterval handle
};

// ─── Country code → flag emoji ──────────────────────────────────────────────
const COUNTRY_ISO2 = {
  AUS: 'AU', CHN: 'CN', JPN: 'JP', BHR: 'BH', SAU: 'SA',
  USA: 'US', MCO: 'MC', MON: 'MC', ESP: 'ES', CAN: 'CA',
  AUT: 'AT', GBR: 'GB', HUN: 'HU', BEL: 'BE', NLD: 'NL',
  ITA: 'IT', AZE: 'AZ', SGP: 'SG', MEX: 'MX', BRA: 'BR',
  UAE: 'AE', QAT: 'QA', POR: 'PT', ARG: 'AR', MYS: 'MY',
  TUR: 'TR', BAH: 'BH', KOR: 'KR', IND: 'IN', CHE: 'CH',
  DEU: 'DE', FRA: 'FR', RUS: 'RU', ZAF: 'ZA',
};
function getFlag(code) {
  const iso2 = COUNTRY_ISO2[code] || (code ? code.slice(0, 2) : 'XX');
  return [...iso2.toUpperCase()].map(c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  ).join('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDriver(name) {
  if (!name) return '—';
  const parts = name.trim().split(' ');
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function formatGap(val) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') {
    if (val === 0) return '—';
    return `+${val.toFixed(3)}s`;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed === '0' || trimmed === '' ? '—' : trimmed;
  }
  return '—';
}

function isAbnormal(status) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === 'dnf' || s === 'dns' || s === 'dsq' || s === 'retired'
    || s.includes('did not') || s.includes('disq');
}

function getTeamDot(colour) {
  const c = colour ? `#${colour.replace('#', '')}` : '#555';
  return `<span class="team-dot" style="background:${c}"></span>`;
}

function getSessionForMeeting(meetingKey, type) {
  // On sprint weekends, session_type is shared (e.g. both "Sprint" and "Race"
  // have session_type "Race"). Match on session_name to get the correct one.
  return state.sessions.find(s =>
    s.meeting_key === meetingKey && s.session_name === type
  ) || null;
}

function sessionStatus(session) {
  if (!session) return 'no-session';
  const now = Date.now();
  const start = new Date(session.date_start).getTime();
  const end = new Date(session.date_end).getTime() + 2 * 60 * 60 * 1000; // +2h buffer
  if (now < start) return 'upcoming';
  if (now <= end) return 'live';
  return 'completed';
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── GP Row ─────────────────────────────────────────────────────────────────
function renderGPRow() {
  const container = document.getElementById('gp-row');
  container.innerHTML = '';
  const sessionType = state.activeTab === 'race' ? 'Race' : 'Qualifying';

  state.meetings.forEach((m, i) => {
    const session = getSessionForMeeting(m.meeting_key, sessionType);
    const status = sessionStatus(session);
    const isClickable = status === 'completed' || status === 'live';

    const card = document.createElement('div');
    card.className = `gp-card ${status}`;
    card.dataset.key = m.meeting_key;

    const flag = getFlag(m.country_code);
    const name = m.circuit_short_name || m.location || m.meeting_name.replace(' Grand Prix', '');
    const date = fmtDate(m.date_start);

    card.innerHTML = `
      <div class="gp-flag">${flag}</div>
      <div class="gp-round">R${i + 1}</div>
      <div class="gp-name">${name}</div>
      <div class="gp-date">${date}</div>
      ${status === 'live' ? '<div class="gp-live-indicator">LIVE</div>' : ''}
    `;

    if (isClickable) {
      card.addEventListener('click', () => selectGP(m.meeting_key));
    }

    container.appendChild(card);
  });

  document.getElementById('gp-row-wrap').classList.remove('hidden');
}

function markActiveCard(meetingKey) {
  document.querySelectorAll('.gp-card').forEach(c => {
    c.classList.toggle('active', Number(c.dataset.key) === meetingKey);
  });
  // Scroll into view
  const active = document.querySelector('.gp-card.active');
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

// ─── Auto-select ─────────────────────────────────────────────────────────────
function autoSelect() {
  const sessionType = state.activeTab === 'race' ? 'Race' : 'Qualifying';

  // Prefer live session
  for (const m of state.meetings) {
    const s = getSessionForMeeting(m.meeting_key, sessionType);
    if (sessionStatus(s) === 'live') { selectGP(m.meeting_key); return; }
  }

  // Most recently completed
  let last = null;
  for (const m of state.meetings) {
    const s = getSessionForMeeting(m.meeting_key, sessionType);
    if (sessionStatus(s) === 'completed') last = m;
  }
  if (last) { selectGP(last.meeting_key); return; }

  // Nothing to show
  document.getElementById('select-prompt').classList.remove('hidden');
}

// ─── Select a GP ─────────────────────────────────────────────────────────────
async function selectGP(meetingKey) {
  stopLive();
  state.selectedKey = meetingKey;
  markActiveCard(meetingKey);

  const meeting = state.meetings.find(m => m.meeting_key === meetingKey);
  const sessionType = state.activeTab === 'race' ? 'Race' : 'Qualifying';
  const session = getSessionForMeeting(meetingKey, sessionType);
  const status = sessionStatus(session);

  // Update header
  document.getElementById('results-title').textContent = meeting.meeting_name;
  document.getElementById('results-subtitle').textContent =
    `${meeting.location}, ${meeting.country_name}  ·  ${fmtDate(meeting.date_start)}`;
  document.getElementById('live-badge').classList.toggle('hidden', status !== 'live');
  document.getElementById('select-prompt').classList.add('hidden');

  showLoading();
  document.getElementById('main').classList.remove('hidden');

  if (status === 'live') {
    await loadLive(session, sessionType);
    startLive(session, sessionType);
  } else if (status === 'completed') {
    await loadCompleted(session, sessionType);
  } else {
    showEmpty('Results not available yet — check back after the session.');
  }
}

// ─── Load completed results ───────────────────────────────────────────────────
async function loadCompleted(session, sessionType) {
  try {
    const data = await apiFetch(`results/${session.session_key}`);
    if (!Array.isArray(data) || data.length === 0) {
      showEmpty('No results available yet.');
      return;
    }
    if (sessionType === 'Race') renderRaceTable(data);
    else renderQualifyingTable(data);
  } catch (e) {
    showError(`Failed to load results: ${e.message}`);
  }
}

// ─── Load live data ───────────────────────────────────────────────────────────
async function loadLive(session, sessionType) {
  try {
    const data = await apiFetch(`live/${session.session_key}`);
    if (!Array.isArray(data) || data.length === 0) {
      // Fall back to session_result if available
      const results = await apiFetch(`results/${session.session_key}`);
      if (Array.isArray(results) && results.length > 0) {
        if (sessionType === 'Race') renderRaceTable(results);
        else renderQualifyingTable(results);
        return;
      }
      showEmpty('Live data not yet available — session may not have started.');
      return;
    }
    renderLiveTable(data);
  } catch (e) {
    showError(`Failed to load live data: ${e.message}`);
  }
}

// ─── Live polling ─────────────────────────────────────────────────────────────
function startLive(session, sessionType) {
  state.liveTimer = setInterval(async () => {
    if (state.selectedKey) await loadLive(session, sessionType);
  }, 5000);
}
function stopLive() {
  if (state.liveTimer) { clearInterval(state.liveTimer); state.liveTimer = null; }
}

// ─── Render: Race table ────────────────────────────────────────────────────────
function renderRaceTable(results) {
  results = [...results].sort((a, b) => (a.position || 99) - (b.position || 99));

  const rows = results.map((r, i) => {
    const pos = r.position || (i + 1);
    const posClass = pos === 1 ? 'pos-1' : pos === 2 ? 'pos-2' : pos === 3 ? 'pos-3' : '';
    const dnf = isAbnormal(r.status);
    const pts = Number(r.points) || 0;

    let timeCell;
    if (i === 0) {
      timeCell = r.duration || r.gap_to_leader || '—';
    } else if (dnf) {
      timeCell = `<span class="col-status">${r.status}</span>`;
    } else {
      timeCell = `<span class="gap">${formatGap(r.gap_to_leader)}</span>`;
    }

    return `<tr class="${i === 0 ? 'row-leader' : ''} ${dnf ? 'row-dnf' : ''}">
      <td class="col-pos ${posClass}">${pos}</td>
      <td class="col-num">${r.driver_number || '—'}</td>
      <td class="col-driver">${formatDriver(r.driver_name)}</td>
      <td class="col-team">${getTeamDot(r.team_colour)}${r.team_name || '—'}</td>
      <td class="col-time">${timeCell}</td>
      <td class="col-pts ${pts === 0 ? 'zero' : ''}">${pts}</td>
    </tr>`;
  });

  setTable(`
    <thead><tr>
      <th class="center">Pos</th>
      <th class="center">#</th>
      <th>Driver</th>
      <th>Team</th>
      <th>Time / Gap</th>
      <th class="center">Pts</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  `);
}

// ─── Render: Qualifying table ──────────────────────────────────────────────────
function renderQualifyingTable(results) {
  results = [...results].sort((a, b) => (a.position || 99) - (b.position || 99));

  // Detect if gap_to_leader is an array [Q1, Q2, Q3]
  const firstGap = results[0]?.gap_to_leader;
  const hasQArray = Array.isArray(firstGap);

  let headers, rows;

  if (hasQArray) {
    headers = `<th class="center">Pos</th><th class="center">#</th><th>Driver</th><th>Team</th>
               <th>Q1</th><th>Q2</th><th>Q3</th>`;
    rows = results.map((r, i) => {
      const pos = r.position || (i + 1);
      const posClass = pos === 1 ? 'pos-1' : pos === 2 ? 'pos-2' : pos === 3 ? 'pos-3' : '';
      const gaps = r.gap_to_leader || [];
      const q = [0, 1, 2].map(j => {
        const v = gaps[j];
        if (v === null || v === undefined || v === '') return `<td class="q-time no-time">—</td>`;
        if (j === 0 && i === 0) return `<td class="q-time pole">${v}</td>`;
        return `<td class="q-time">${typeof v === 'number' ? (v > 0 ? `+${v.toFixed(3)}` : v) : v}</td>`;
      });
      return `<tr class="${i === 0 ? 'row-leader' : ''}">
        <td class="col-pos ${posClass}">${pos}</td>
        <td class="col-num">${r.driver_number || '—'}</td>
        <td class="col-driver">${formatDriver(r.driver_name)}</td>
        <td class="col-team">${getTeamDot(r.team_colour)}${r.team_name || '—'}</td>
        ${q.join('')}
      </tr>`;
    });
  } else {
    headers = `<th class="center">Pos</th><th class="center">#</th><th>Driver</th><th>Team</th>
               <th>Gap to Pole</th>`;
    rows = results.map((r, i) => {
      const pos = r.position || (i + 1);
      const posClass = pos === 1 ? 'pos-1' : pos === 2 ? 'pos-2' : pos === 3 ? 'pos-3' : '';
      const gapCell = i === 0
        ? `<td class="q-time pole">POLE</td>`
        : `<td class="q-time">${formatGap(r.gap_to_leader)}</td>`;
      return `<tr class="${i === 0 ? 'row-leader' : ''}">
        <td class="col-pos ${posClass}">${pos}</td>
        <td class="col-num">${r.driver_number || '—'}</td>
        <td class="col-driver">${formatDriver(r.driver_name)}</td>
        <td class="col-team">${getTeamDot(r.team_colour)}${r.team_name || '—'}</td>
        ${gapCell}
      </tr>`;
    });
  }

  setTable(`<thead><tr>${headers}</tr></thead><tbody>${rows.join('')}</tbody>`);
}

// ─── Render: Live table ────────────────────────────────────────────────────────
function renderLiveTable(data) {
  const rows = data.map((r, i) => {
    const pos = r.position || (i + 1);
    const posClass = pos === 1 ? 'pos-1' : pos === 2 ? 'pos-2' : pos === 3 ? 'pos-3' : '';
    return `<tr class="${i === 0 ? 'row-leader' : ''}">
      <td class="col-pos ${posClass}">${pos}</td>
      <td class="col-num">${r.driver_number}</td>
      <td class="col-driver">
        ${formatDriver(r.driver_name)}
        ${r.name_acronym ? `<span class="driver-acronym">${r.name_acronym}</span>` : ''}
      </td>
      <td class="col-team">${getTeamDot(r.team_colour)}${r.team_name}</td>
      <td class="col-time gap">${i === 0 ? '<span style="color:#f5c518">Leader</span>' : formatGap(r.gap_to_leader)}</td>
      <td class="col-time gap">${i === 0 ? '—' : formatGap(r.interval)}</td>
    </tr>`;
  });

  setTable(`
    <thead><tr>
      <th class="center">Pos</th>
      <th class="center">#</th>
      <th>Driver</th>
      <th>Team</th>
      <th>Gap</th>
      <th>Interval</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  `);
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function setTable(innerHTML) {
  const table = document.createElement('table');
  table.className = 'results-table';
  table.innerHTML = innerHTML;
  const container = document.getElementById('results-content');
  container.innerHTML = '';
  container.appendChild(table);
}
function showLoading() {
  document.getElementById('results-content').innerHTML =
    '<div class="loading"><div class="spinner"></div><span>Loading…</span></div>';
}
function showError(msg) {
  document.getElementById('results-content').innerHTML =
    `<p class="msg-error">${msg}</p>`;
}
function showEmpty(msg) {
  document.getElementById('results-content').innerHTML =
    `<p class="msg-empty">${msg}</p>`;
}

// ─── API fetch helper ─────────────────────────────────────────────────────────
async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

// ─── Standings ────────────────────────────────────────────────────────────────
let standingsCache = null;

async function loadStandings() {
  const container = document.getElementById('standings-content');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading…</span></div>';

  try {
    if (!standingsCache) {
      standingsCache = await apiFetch('standings');
    }
    if (state.activeTab === 'drivers') renderDriverStandings(standingsCache.drivers);
    else renderConstructorStandings(standingsCache.constructors);
  } catch (e) {
    container.innerHTML = `<p class="msg-error">Failed to load standings: ${e.message}</p>`;
  }
}

function renderDriverStandings(drivers) {
  const rows = drivers.map((d, i) => {
    const pos = i + 1;
    const posClass = pos === 1 ? 'pos-1' : pos === 2 ? 'pos-2' : pos === 3 ? 'pos-3' : '';
    return `<tr>
      <td class="col-pos ${posClass}">${pos}</td>
      <td class="col-num">${d.driver_number}</td>
      <td class="col-driver">${formatDriver(d.driver_name)}</td>
      <td class="col-team">${getTeamDot(d.team_colour)}${d.team_name}</td>
      <td class="col-wins">${d.wins}</td>
      <td class="col-pts">${d.points}</td>
    </tr>`;
  });

  setStandingsTable(`
    <thead><tr>
      <th class="center">Pos</th>
      <th class="center">#</th>
      <th>Driver</th>
      <th>Team</th>
      <th class="center">Wins</th>
      <th class="center">Pts</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  `);
}

function renderConstructorStandings(constructors) {
  const rows = constructors.map((t, i) => {
    const pos = i + 1;
    const posClass = pos === 1 ? 'pos-1' : pos === 2 ? 'pos-2' : pos === 3 ? 'pos-3' : '';
    return `<tr>
      <td class="col-pos ${posClass}">${pos}</td>
      <td class="col-team" style="font-weight:600;color:#fff">${getTeamDot(t.team_colour)}${t.team_name}</td>
      <td class="col-wins">${t.wins}</td>
      <td class="col-pts">${t.points}</td>
    </tr>`;
  });

  setStandingsTable(`
    <thead><tr>
      <th class="center">Pos</th>
      <th>Constructor</th>
      <th class="center">Wins</th>
      <th class="center">Pts</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  `);
}

function setStandingsTable(innerHTML) {
  const table = document.createElement('table');
  table.className = 'results-table';
  table.innerHTML = innerHTML;
  const container = document.getElementById('standings-content');
  container.innerHTML = '';
  container.appendChild(table);
}

function showResultsView() {
  document.getElementById('schedule-loading').classList.remove('hidden');
  document.getElementById('standings-main').classList.add('hidden');
  document.getElementById('select-prompt').classList.add('hidden');
  document.getElementById('main').classList.add('hidden');
}

function showStandingsView() {
  document.getElementById('schedule-loading').classList.add('hidden');
  document.getElementById('gp-row-wrap').classList.add('hidden');
  document.getElementById('main').classList.add('hidden');
  document.getElementById('select-prompt').classList.add('hidden');
  document.getElementById('standings-main').classList.remove('hidden');
  loadStandings();
}

// ─── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === state.activeTab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeTab = tab.dataset.tab;
    stopLive();

    if (state.activeTab === 'drivers' || state.activeTab === 'constructors') {
      showStandingsView();
      return;
    }

    // Coming back from standings to results tabs
    document.getElementById('standings-main').classList.add('hidden');
    document.getElementById('gp-row-wrap').classList.remove('hidden');
    renderGPRow();

    // Try to keep the same GP selected across tabs
    if (state.selectedKey) {
      const sessionType = state.activeTab === 'race' ? 'Race' : 'Qualifying';
      const session = getSessionForMeeting(state.selectedKey, sessionType);
      const status = sessionStatus(session);
      if (status !== 'upcoming' && status !== 'no-session') {
        selectGP(state.selectedKey);
        return;
      }
    }
    autoSelect();
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const [meetings, sessions] = await Promise.all([
      apiFetch('schedule'),
      apiFetch('sessions'),
    ]);

    state.meetings = meetings;
    state.sessions = sessions;

    document.getElementById('schedule-loading').classList.add('hidden');
    renderGPRow();
    autoSelect();
  } catch (e) {
    document.getElementById('schedule-loading').innerHTML =
      `<p class="msg-error">Failed to load schedule: ${e.message}</p>`;
  }
}

init();
