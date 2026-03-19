const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sportsService = require('../services/sportsService');

const router = express.Router();
const CONFIG_PATH = path.join(__dirname, '../config/config.json');

const DEFAULT_CONFIG = {
  enabledLeagues: [
    'soccer/eng.1', 'soccer/esp.1', 'soccer/ger.1', 'soccer/usa.1',
    'soccer/uefa.champions', 'soccer/arg.1', 'tennis/atp', 'tennis/wta',
  ],
  teamFilters: {},
};

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.enabledLeagues) && parsed.enabledLeagues.length > 0) {
      return parsed;
    }
  } catch (_) {
    // fall through to default
  }
  return DEFAULT_CONFIG;
}

router.get('/config', async (req, res) => {
  try {
    const config = await readConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config', async (req, res) => {
  const { enabledLeagues, teamFilters } = req.body;
  if (!Array.isArray(enabledLeagues)) {
    return res.status(400).json({ error: 'enabledLeagues must be an array' });
  }
  const config = {
    enabledLeagues,
    teamFilters: (teamFilters && typeof teamFilters === 'object' && !Array.isArray(teamFilters))
      ? teamFilters
      : {},
  };
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    res.json({ ok: true, ...config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/scoreboard', async (req, res) => {
  try {
    const config = await readConfig();
    const games = await sportsService.getScoreboard(config.enabledLeagues, config.teamFilters);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/upcoming', async (req, res) => {
  try {
    const config = await readConfig();
    const games = await sportsService.getUpcoming(config.enabledLeagues, config.teamFilters);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
