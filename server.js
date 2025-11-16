// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const MAX_CAPACITY = 60;

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // serves public/index.html

// Simple in-memory store
let currentCount = 0;
let clients = []; // SSE connections

function clampCount(n) {
  if (n < 0) return 0;
  if (n > MAX_CAPACITY) return MAX_CAPACITY;
  return n;
}
function computePercent(n) {
  const raw = (n / MAX_CAPACITY) * 100;
  return Math.round(raw);
}

function broadcastState() {
  const payload = {
    count: currentCount,
    percent: computePercent(currentCount),
    max: MAX_CAPACITY,
    ts: new Date().toISOString()
  };
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach(res => {
    try { res.write(data); } catch (e) {}
  });
}

// Single event endpoint
app.post('/api/sensor', (req, res) => {
  const headerKey = (req.get('x-api-key') || '');
  const SENSOR_API_KEY = process.env.SENSOR_API_KEY || '';
  if (SENSOR_API_KEY && headerKey !== SENSOR_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const body = req.body || {};
  const ev = (body.event || '').toString().toLowerCase();
  if (ev !== 'enter' && ev !== 'exit') {
    return res.status(400).json({ error: 'event must be \"enter\" or \"exit\"' });
  }

  if (ev === 'enter') currentCount = clampCount(currentCount + 1);
  else currentCount = clampCount(currentCount - 1);

  console.log(`Event: ${ev} -> count=${currentCount}`);
  broadcastState();
  return res.json({ ok: true, count: currentCount, percent: computePercent(currentCount) });
});

// Batch endpoint (recommended for offline sync)
app.post('/api/sensor/batch', (req, res) => {
  const headerKey = (req.get('x-api-key') || '');
  const SENSOR_API_KEY = process.env.SENSOR_API_KEY || '';
  if (SENSOR_API_KEY && headerKey !== SENSOR_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const events = Array.isArray(req.body) ? req.body : req.body.events;
  if (!events || !Array.isArray(events)) return res.status(400).json({ error: 'expected array of events' });

  let applied = 0;
  events.forEach(ev => {
    const e = (ev.event || '').toString().toLowerCase();
    if (e === 'enter') { currentCount = clampCount(currentCount + 1); applied++; }
    else if (e === 'exit') { currentCount = clampCount(currentCount - 1); applied++; }
  });

  console.log(`Batch applied: ${applied} events -> count=${currentCount}`);
  broadcastState();
  return res.json({ ok: true, applied, count: currentCount, percent: computePercent(currentCount) });
});

// SSE for frontend
app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();

  const init = { count: currentCount, percent: computePercent(currentCount), max: MAX_CAPACITY, ts: new Date().toISOString() };
  res.write(`data: ${JSON.stringify(init)}\n\n`);

  clients.push(res);
  console.log('New SSE client connected. total:', clients.length);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
    console.log('SSE client disconnected. total:', clients.length);
  });
});

app.get('/api/state', (req, res) => {
  return res.json({ count: currentCount, percent: computePercent(currentCount), max: MAX_CAPACITY, ts: new Date().toISOString() });
});

// reset
app.post('/api/reset', (req, res) => {
  currentCount = 0;
  broadcastState();
  res.json({ ok: true, count: currentCount });
});

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
