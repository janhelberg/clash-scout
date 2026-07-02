const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const COC_BASE = 'https://api.clashofclans.com/v1';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch town hall distribution for a single clan
async function fetchClanTHDistribution(clanTag, token) {
  // Normalize: strip whitespace, uppercase, replace letter O with digit 0, ensure # prefix
  let tag = clanTag.trim().toUpperCase().replace(/O/g, '0');
  if (!tag.startsWith('#')) tag = '#' + tag;
  const encoded = encodeURIComponent(tag);
  const url = `${COC_BASE}/clans/${encoded}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const reason = err.reason || err.message || response.statusText;
    throw new Error(`Clan ${clanTag}: ${response.status} - ${reason}`);
  }

  const data = await response.json();
  const name = data.name || clanTag;
  const members = data.memberList || [];

  // Count members per town hall level
  const distribution = {};
  for (const member of members) {
    const th = member.townHallLevel;
    distribution[th] = (distribution[th] || 0) + 1;
  }

  return { tag: clanTag, name, memberCount: members.length, distribution };
}

// POST /api/scan  body: { token, clans: ["#TAG1", ...] }
app.post('/api/scan', async (req, res) => {
  const { token, clans } = req.body;

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return res.status(400).json({ error: 'Auth token is required.' });
  }

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
      const result = await fetchClanTHDistribution(tag.trim(), token.trim());
      results.push(result);
    } catch (err) {
      errors.push(err.message);
    }
  }

  return res.json({ results, errors });
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

app.listen(PORT, () => {
  console.log(`Clash Scout running on port ${PORT}`);
});
