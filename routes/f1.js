const express = require('express');
const f1Service = require('../services/f1Service');
const router = express.Router();


// 2026 Grand Prix schedule (GP meetings only, no testing)
router.get('/schedule', async (req, res) => {
  try {
    const meetings = await f1Service.openF1Fetch('/meetings?year=2026');
    const gps = meetings.filter(m =>
      m.meeting_name && m.meeting_name.toLowerCase().includes('grand prix')
    );
    gps.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
    res.json(gps);
  } catch (e) {
    console.error('Schedule error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// All 2026 sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await f1Service.openF1Fetch('/sessions?year=2026');
    res.json(sessions);
  } catch (e) {
    console.error('Sessions error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Completed session results (race or qualifying) — joined with driver info
router.get('/results/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const [results, drivers] = await Promise.all([
      f1Service.openF1Fetch(`/session_result?session_key=${key}`, 5 * 60 * 1000),
      f1Service.openF1Fetch(`/drivers?session_key=${key}`).catch(() => []),
    ]);

    const driverMap = f1Service.buildDriverMap(drivers);

    const enriched = (results || []).map(r => ({
      ...r,
      driver_name: r.driver_name || driverMap[r.driver_number]?.full_name || `#${r.driver_number}`,
      team_name: r.team_name || driverMap[r.driver_number]?.team_name || '—',
      team_colour: r.team_colour || driverMap[r.driver_number]?.team_colour || null,
    }));

    res.json(enriched);
  } catch (e) {
    console.error('Results error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Championship standings — aggregated from all completed race/sprint sessions
router.get('/standings', async (req, res) => {
  try {
    const sessions = await f1Service.openF1Fetch('/sessions?year=2026');
    const now = Date.now();
    const completedRaceSessions = sessions.filter(s =>
      s.session_type === 'Race' && new Date(s.date_end).getTime() < now
    );

    // Fetch results + drivers for every completed session in parallel
    const sessionData = await Promise.all(
      completedRaceSessions.map(s => Promise.all([
        f1Service.openF1Fetch(`/session_result?session_key=${s.session_key}`, 60 * 60 * 1000).catch(() => []),
        f1Service.openF1Fetch(`/drivers?session_key=${s.session_key}`, 60 * 60 * 1000).catch(() => []),
      ]))
    );

    const driverStandings = {};  // driver_number → entry
    const teamStandings = {};    // team_name → entry

    for (let i = 0; i < completedRaceSessions.length; i++) {
      const [results, drivers] = sessionData[i];
      const driverMap = f1Service.buildDriverMap(drivers);

      for (const r of (results || [])) {
        const pts = Number(r.points) || 0;
        const dn = r.driver_number;
        const d = driverMap[dn] || {};
        const driverName = d.full_name || `#${dn}`;
        const teamName = d.team_name || '—';
        const teamColour = d.team_colour || null;

        // Driver
        if (!driverStandings[dn]) {
          driverStandings[dn] = { driver_number: dn, driver_name: driverName, team_name: teamName, team_colour: teamColour, points: 0, wins: 0 };
        }
        driverStandings[dn].points += pts;
        if (r.position === 1) driverStandings[dn].wins++;

        // Constructor
        if (teamName !== '—') {
          if (!teamStandings[teamName]) {
            teamStandings[teamName] = { team_name: teamName, team_colour: teamColour, points: 0, wins: 0 };
          }
          teamStandings[teamName].points += pts;
          if (r.position === 1) teamStandings[teamName].wins++;
        }
      }
    }

    const drivers = Object.values(driverStandings).sort((a, b) => b.points - a.points || b.wins - a.wins);
    const constructors = Object.values(teamStandings).sort((a, b) => b.points - a.points || b.wins - a.wins);

    res.json({ drivers, constructors });
  } catch (e) {
    console.error('Standings error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Live session data — positions + intervals + drivers combined (no cache)
router.get('/live/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const [positions, intervals, drivers] = await Promise.all([
      f1Service.openF1Fetch(`/position?session_key=${key}`, 0),
      f1Service.openF1Fetch(`/intervals?session_key=${key}`, 0),
      f1Service.openF1Fetch(`/drivers?session_key=${key}`).catch(() => []),
    ]);

    const latestPositions = f1Service.latestPerDriver(positions);
    const latestIntervals = f1Service.latestPerDriver(intervals);
    const driverMap = f1Service.buildDriverMap(drivers);

    const intervalMap = {};
    for (const i of latestIntervals) {
      intervalMap[i.driver_number] = i;
    }

    const combined = latestPositions.map(p => {
      const driver = driverMap[p.driver_number] || {};
      const interval = intervalMap[p.driver_number] || {};
      return {
        position: p.position,
        driver_number: p.driver_number,
        driver_name: driver.full_name || driver.broadcast_name || `#${p.driver_number}`,
        name_acronym: driver.name_acronym || '',
        team_name: driver.team_name || '—',
        team_colour: driver.team_colour || null,
        gap_to_leader: interval.gap_to_leader ?? null,
        interval: interval.interval ?? null,
      };
    });

    combined.sort((a, b) => (a.position || 99) - (b.position || 99));
    res.json(combined);
  } catch (e) {
    console.error('Live error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;