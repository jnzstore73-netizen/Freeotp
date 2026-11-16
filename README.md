# NokosFree

1. Daftar di https://5sim.net, isi saldo, ambil API token (Profile > API).
2. `cp .env.example .env` lalu isi `FIVESIM_TOKEN`.
3. `npm install` lalu `npm start`, buka http://localhost:3000
4. Deploy ke VPS/Railway/Render (Node 18+). Pakai HTTPS (Nginx/Caddy atau fitur bawaan hosting).

Catatan: tiap nomor memotong saldo provider Anda. Atur `MAX_ORDERS_PER_HOUR` agar tidak disalahgunakan.
