// Voice Call Changer — static file server + WebSocket signaling (no PeerJS / no external broker)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = '/home/user';
const PORT = 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/voice call.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // room -> Set of ws

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws) => {
  ws.rooms = new Set();
  ws.on('message', (msg) => {
    let m;
    try { m = JSON.parse(msg.toString()); } catch (e) { return; }
    if (m.type === 'join') {
      ws.rooms.add(m.room);
      if (!rooms.has(m.room)) rooms.set(m.room, new Set());
      rooms.get(m.room).add(ws);
      send(ws, { type: 'joined', room: m.room, count: rooms.get(m.room).size });
      return;
    }
    // relay to others in the message's room
    const set = rooms.get(m.room);
    if (set) {
      for (const o of set) if (o !== ws) send(o, m);
    }
  });
  ws.on('close', () => {
    for (const r of ws.rooms) {
      const set = rooms.get(r);
      if (set) {
        set.delete(ws);
        for (const o of set) send(o, { type: 'peer-left' });
        if (set.size === 0) rooms.delete(r);
      }
    }
  });
});

server.listen(PORT, () => console.log('Voice Call server running on http://localhost:' + PORT));
