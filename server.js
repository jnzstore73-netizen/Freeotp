const express = require('express');
const path = require('path');
try { process.loadEnvFile && process.loadEnvFile(); } catch (e) {}

const TOKEN = process.env.FIVESIM_TOKEN;
const PORT = process.env.PORT || 3000;
const MAX = parseInt(process.env.MAX_ORDERS_PER_HOUR || '5', 10);
if (!TOKEN) { console.error('FIVESIM_TOKEN belum diisi di file .env'); process.exit(1); }

const API = 'https://5sim.net/v1';
const PRODUCTS = { wa: 'whatsapp', tg: 'telegram', ig: 'instagram', fb: 'facebook', tt: 'tiktok', gg: 'google' };
const COUNTRIES = { ID: 'indonesia', MY: 'malaysia', US: 'usa', GB: 'england', IN: 'india' };

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const owners = new Map();   // id -> ip
const hits = new Map();     // ip -> [timestamps]

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= MAX) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list); return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, l] of hits) { const f = l.filter(t => now - t < 3600e3); f.length ? hits.set(ip, f) : hits.delete(ip); }
}, 600e3).unref();

async function fivesim(p) {
  const r = await fetch(API + p, { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' } });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = text; }
  return { ok: r.ok, status: r.status, data };
}

app.post('/api/order', async (req, res) => {
  const product = PRODUCTS[req.body && req.body.service];
  const country = COUNTRIES[req.body && req.body.country];
  if (!product || !country) return res.status(400).json({ error: 'Layanan atau negara tidak valid' });
  if (limited(req.ip)) return res.status(429).json({ error: 'Batas pesanan per jam tercapai, coba lagi nanti' });
  try {
    const r = await fivesim(`/user/buy/activation/${country}/any/${product}`);
    if (!r.ok || !r.data || !r.data.id) {
      const msg = typeof r.data === 'string' ? r.data : '';
      if (/no free phones/i.test(msg)) return res.status(503).json({ error: 'Stok nomor sedang habis, coba negara lain' });
      if (/not enough/i.test(msg)) return res.status(503).json({ error: 'Layanan sedang tidak tersedia' });
      return res.status(502).json({ error: 'Gagal memesan nomor dari provider' });
    }
    owners.set(String(r.data.id), req.ip);
    res.json({ id: r.data.id, number: r.data.phone });
  } catch (e) {
    res.status(502).json({ error: 'Provider tidak dapat dihubungi' });
  }
});

function guard(req, res) {
  const id = req.params.id;
  if (!/^\d+$/.test(id) || owners.get(id) !== req.ip) { res.status(404).json({ error: 'Pesanan tidak ditemukan' }); return null; }
  return id;
}

app.get('/api/order/:id', async (req, res) => {
  const id = guard(req, res); if (!id) return;
  try {
    const r = await fivesim('/user/check/' + id);
    if (!r.ok || typeof r.data !== 'object') return res.status(502).json({ error: 'Gagal cek status' });
    const sms = Array.isArray(r.data.sms) ? r.data.sms : [];
    const code = sms.length ? (sms[sms.length - 1].code || null) : null;
    if (code) { fivesim('/user/finish/' + id).catch(() => {}); owners.delete(id); }
    res.json({ status: r.data.status, code });
  } catch (e) {
    res.status(502).json({ error: 'Provider tidak dapat dihubungi' });
  }
});

app.post('/api/order/:id/cancel', async (req, res) => {
  const id = guard(req, res); if (!id) return;
  try { await fivesim('/user/cancel/' + id); } catch (e) {}
  owners.delete(id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log('NokosFree berjalan di http://localhost:' + PORT));
