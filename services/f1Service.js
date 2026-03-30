const OPENF1_BASE = 'https://api.openf1.org/v1';

// In-memory cache: path -> { data, expiresAt }
const cache = new Map();

async function openF1Fetch(urlPath, ttlMs = 60 * 60 * 1000) {
  if (ttlMs > 0 && cache.has(urlPath)) {
    const entry = cache.get(urlPath);
    if (Date.now() < entry.expiresAt) return entry.data;
  }

  const headers = { Accept: 'application/json' };
  if (process.env.OPENF1_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OPENF1_API_KEY}`;
  }

  const res = await fetch(`${OPENF1_BASE}${urlPath}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenF1 ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (ttlMs > 0) {
    cache.set(urlPath, { data, expiresAt: Date.now() + ttlMs });
  }
  return data;
}

// Returns latest record per driver_number (by timestamp)
function latestPerDriver(records) {
  const map = new Map();
  for (const r of records) {
    const dn = r.driver_number;
    const existing = map.get(dn);
    if (!existing || r.date > existing.date) {
      map.set(dn, r);
    }
  }
  return Array.from(map.values());
}

// Build driver map from drivers array
function buildDriverMap(drivers) {
  const map = {};
  for (const d of (drivers || [])) {
    map[d.driver_number] = d;
  }
  return map;
}

module.exports = { openF1Fetch, buildDriverMap, latestPerDriver };