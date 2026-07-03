const express = require('express');
const path = require('path');
const { Client } = require('clashofclans.js');

const app = express();
const PORT = process.env.PORT || 3000;
const MY_TAG = '#PYYC82JV';

const client = new Client();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch town hall distribution for a single clan
async function fetchClanTHDistribution(clanTag) {
  // Normalize: strip whitespace, uppercase, replace letter O with digit 0, ensure # prefix
  let tag = clanTag.trim().toUpperCase().replace(/O/g, '0');
  if (!tag.startsWith('#')) tag = '#' + tag;

  const clan = await client.getClan(tag);
  const distribution = {};
  for (const member of clan.members) {
    const th = member.townHallLevel;
    distribution[th] = (distribution[th] || 0) + 1;
  }
  return { tag: clan.tag, name: clan.name, memberCount: clan.members.length, distribution };
}

// POST /api/scan  body: { clans: ["#TAG1", ...] }
app.post('/api/scan', async (req, res) => {
  const { clans } = req.body;

  if (!Array.isArray(clans) || clans.length === 0) {
    return res.status(400).json({ error: 'At least one clan tag is required.' });
  }

  if (clans.length > 8) {
    return res.status(400).json({ error: 'Maximum 8 clans allowed.' });
  }

  const results = [];
  const errors = [];

  // Fetch all clans — sequential to avoid rate limiting
  for (const tag of clans) {
    if (!tag || tag.trim() === '') continue;
    try {
      const result = await fetchClanTHDistribution(tag.trim());
      results.push(result);
    } catch (err) {
      errors.push(err.message);
    }
  }

  return res.json({ results, errors });
});

// Returns the other 7 clan tags from the current CWL league group
app.get('/api/cwl-clans', async (_req, res) => {
  try {
    const group = await client.getClanWarLeagueGroup(MY_TAG);
    const tags = group.clans.map(c => c.tag).filter(t => t.toUpperCase() !== MY_TAG);
    res.json({ tags });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Returns clan tags from clans.txt (one tag per line)
app.get('/api/clans', async (_req, res) => {
  res.json({ tags: [] });
});

// Returns the server's own public outbound IP (for CoC API whitelisting)
app.get('/api/myip', async (_req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const data = await r.json();
    res.json({ ip: data.ip });
  } catch {
    res.status(500).json({ error: 'Could not determine IP' });
  }
});

async function start() {
  const email = process.env.COC_EMAIL;
  const password = process.env.COC_PASSWORD;

  if (!email || !password) {
    console.error('COC_EMAIL and COC_PASSWORD environment variables are required.');
    process.exit(1);
  }

  await client.login({ email, password });
  console.log('Authenticated with CoC developer portal');

  app.listen(PORT, () => {
    console.log(`Clash Scout running on port ${PORT}`);
  });
}

start();
