'use strict';
// Klotzwelt-Server: liefert das Spiel aus und kümmert sich um Konten, Freunde, Gruppen und Mehrspieler.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { nameProblem } = require('./namefilter');
const db = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const FILES = { '/index.html': 'text/html; charset=utf-8', '/sw.js': 'text/javascript; charset=utf-8', '/manifest.webmanifest': 'application/manifest+json', '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/apple-touch-icon.png': 'image/png' };
const GAMES = { obby: 'Himmelsparcours', build: 'Baukasten', race: 'Klotz-Rennen', moto: 'Turbo-Rennen', skate: 'Skatepark', fight: 'Box-Ring', blaster: 'Blaster-Arena', horror: 'Gruselvilla' };
const GAME_AGE = { horror: 8, fight: 8, blaster: 10 };
const ROOM_MAX = 10;
const TOKEN_DAYS = 30;
// Der Erfinder-Code steht NICHT im Code, sondern als Umgebungsvariable CREATOR_CODE bei Render.
const CREATOR_CODE = String(process.env.CREATOR_CODE || '').trim();
// Private Website: Ist SITE_CODE gesetzt, kommt nur rein, wer diesen Zugangscode kennt.
const SITE_CODE = String(process.env.SITE_CODE || '').trim();
const ACCESS_TOKEN = SITE_CODE ? crypto.createHmac('sha256', SITE_CODE).update('klotzwelt-zugang').digest('hex') : '';
const OPEN_FILES = new Set(['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']);
function hasAccess(req) {
  if (!SITE_CODE) return true;
  const m = /(?:^|;\s*)kz_zugang=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  return !!m && crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(ACCESS_TOKEN));
}
const gateTries = new Map();
function gatePage(res, error) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Klotzwelt</title>
<link rel="apple-touch-icon" href="apple-touch-icon.png"><meta name="theme-color" content="#8fd0f5">
<style>
:root{--sky:#8fd0f5;--ink:#1d2a44;--paper:#fffdf6;--accent:#ff6b3d;--bad:#c8362b;color-scheme:light}
html,body{height:100%;margin:0}body{background:var(--sky);color:var(--ink);font:600 16px system-ui,-apple-system,'Segoe UI',sans-serif;display:grid;place-items:center;padding:16px;box-sizing:border-box}
form{background:var(--paper);border:3px solid var(--ink);border-radius:16px;box-shadow:5px 5px 0 var(--ink);padding:24px;width:min(360px,100%);box-sizing:border-box;display:flex;flex-direction:column;gap:12px}
h1{margin:0;font:900 34px/1 'Arial Black',Impact,sans-serif;color:var(--accent);-webkit-text-stroke:1.5px var(--ink)}
p{margin:0;color:#5a6a88;font-size:14px}input{border:3px solid var(--ink);border-radius:10px;padding:10px;font:inherit;font-weight:800}
button{border:3px solid var(--ink);border-radius:10px;background:var(--accent);color:var(--paper);padding:10px;font:inherit;font-weight:800;box-shadow:3px 3px 0 var(--ink);cursor:pointer}
.err{color:var(--bad);font-weight:800}
</style></head><body>
<form method="post" action="/zugang"><h1>Klotzwelt</h1><p>Diese Klotzwelt ist privat. Gib den Zugangscode ein, den du von den Erfindern bekommen hast.</p>
<label for="code">Zugangscode</label><input id="code" name="code" type="password" autocomplete="off" autofocus>
${error ? '<p class="err">' + error + '</p>' : ''}<button type="submit">Reinkommen</button></form></body></html>`);
}

// ---------- Webseite ----------
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/') p = '/index.html';
  if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (SITE_CODE && p === '/zugang' && req.method === 'POST') {
    let body = '';
    req.on('data', ch => { body += ch; if (body.length > 2000) req.destroy(); });
    req.on('end', () => {
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const list = (gateTries.get(ip) || []).filter(t => Date.now() - t < 600e3); gateTries.set(ip, list);
      if (list.length >= 10) return gatePage(res, 'Zu viele Versuche. Warte 10 Minuten.');
      const code = String(new URLSearchParams(body).get('code') || '').trim(), a = Buffer.from(code), b = Buffer.from(SITE_CODE);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { list.push(Date.now()); return gatePage(res, 'Der Zugangscode stimmt nicht.'); }
      const secure = /^localhost|^127\./.test(req.headers.host || '') ? '' : '; Secure';
      res.writeHead(303, { location: '/', 'set-cookie': 'kz_zugang=' + ACCESS_TOKEN + '; Path=/; Max-Age=15552000; HttpOnly; SameSite=Lax' + secure });
      res.end();
    });
    return;
  }
  if (SITE_CODE && !OPEN_FILES.has(p) && !hasAccess(req)) {
    if (p === '/' || p === '/index.html') return gatePage(res, '');
    res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Privat');
  }
  if (!FILES[p]) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
  fs.readFile(path.join(ROOT, p), (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    // Seite und Service Worker nie zwischenspeichern, damit Updates sofort ankommen
    res.writeHead(200, { 'content-type': FILES[p], 'cache-control': /html|javascript/.test(FILES[p]) ? 'no-store' : 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(buf);
  });
});

// ---------- Hilfsfunktionen ----------
const D = () => db.data;
const low = n => String(n || '').trim().toLowerCase();
const now = () => Date.now();
const clients = new Set();
const online = new Map();   // benutzername (klein) -> Verbindung
const rooms = new Map();    // raum-id -> { key, game, players: Set }
const parties = new Map();  // gruppen-id -> { id, leader, members: Set, invited: Set }
let nextId = 1;

function send(c, msg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }
const err = (c, msg) => send(c, { t: 'error', msg });
const notice = (c, msg) => send(c, { t: 'notice', msg });

function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPw(pw, rec) {
  const h = crypto.scryptSync(pw, rec.salt, 64);
  const want = Buffer.from(rec.hash, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}
function ageGroup(year) {
  const a = new Date().getFullYear() - year;
  return a < 13 ? 'u13' : a < 18 ? '13-17' : '18+';
}
const num = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : null;

// Nur bekannte, kleine Profilfelder speichern
function cleanProfile(p) {
  p = p && typeof p === 'object' ? p : {};
  const out = { coins: Math.round(num(p.coins, 0, 1e7, 150)), owned: [], wear: {}, body: {}, shape: {} };
  if (Array.isArray(p.owned)) out.owned = p.owned.map(x => str(x, 30)).filter(Boolean).slice(0, 400);
  if (p.wear && typeof p.wear === 'object') for (const k of ['face', 'hair', 'shirt', 'pants', 'shoes', 'hat', 'acc', 'neck', 'back', 'weapon', 'board']) out.wear[k] = str(p.wear[k], 30);
  if (p.body && typeof p.body === 'object') for (const k of ['head', 'torso', 'arms', 'legs']) out.body[k] = Math.round(num(p.body[k], 0, 15, 0));
  const s = p.shape || {};
  out.shape = { height: num(s.height, 0.85, 1.2, 1), width: num(s.width, 0.85, 1.35, 1), head: num(s.head, 0.85, 1.3, 1) };
  out.gender = p.gender === 'girl' || p.gender === 'boy' ? p.gender : null;
  return out;
}
const roleOf = u => (D().users[u] && D().users[u].role) || null;
const isAdminU = u => roleOf(u) === 'creator' || roleOf(u) === 'admin';
// Haupt-Erfinder = Rolle 'creator' (höchstens 10). Der Gründer (D().owner) darf als Einziger Haupt-Erfinder löschen.
const MAX_MAIN = 10;
const mainCount = () => Object.values(D().users).filter(x => x.role === 'creator').length;
const ownerOk = () => !!(D().owner && D().users[D().owner] && D().users[D().owner].role === 'creator');
const bansOf = u => Object.keys(GAMES).filter(g => (D().bans[g] || []).some(b => b.u === u));
function adminData() {
  const admins = Object.entries(D().users).filter(([, x]) => x.role).map(([u, x]) => ({ name: x.name, role: x.role, owner: D().owner === u }));
  const bans = {};
  for (const g of Object.keys(GAMES)) bans[g] = (D().bans[g] || []).map(b => ({ name: D().users[b.u] ? D().users[b.u].name : b.u, by: b.by, at: b.at }));
  return { t: 'adminData', admins, bans };
}
function pushAdmins() { for (const [u, c] of online) if (isAdminU(u)) send(c, adminData()); }
function meOf(u) {
  const usr = D().users[u];
  return { name: usr.name, age: ageGroup(usr.year), years: new Date().getFullYear() - usr.year, role: usr.role || null, owner: D().owner === u, noOwner: !ownerOk(), bans: bansOf(u), mail: (usr.mail || []).filter(m => !m.read).map(m => m.text), profile: usr.profile };
}
const lookOf = u => { const usr = D().users[u], p = usr.profile || {}; return { name: usr.name, role: usr.role || null, body: p.body, wear: p.wear, shape: p.shape }; };

// ---------- Freunde & Gruppen ----------
function partyInfo(p) { return { id: p.id, leader: D().users[p.leader].name, members: [...p.members].map(m => D().users[m].name) }; }
function socialOf(u) {
  const usr = D().users[u], c = online.get(u);
  const friends = usr.friends.filter(f => D().users[f]).map(f => {
    const oc = online.get(f);
    return { name: D().users[f].name, role: D().users[f].role || null, online: !!oc, game: oc && oc.room ? oc.room.game : null, room: oc && oc.room ? oc.room.key : null };
  }).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
  const requests = usr.requests.filter(r => D().users[r]).map(r => D().users[r].name);
  const invites = [...parties.values()].filter(p => p.invited.has(u)).map(p => ({ id: p.id, from: D().users[p.leader].name }));
  return { t: 'social', friends, requests, invites, party: c && c.party ? partyInfo(c.party) : null };
}
function pushSocial(u) { const c = online.get(u); if (c) send(c, socialOf(u)); }
function pushFriends(u) { const usr = D().users[u]; if (usr) for (const f of usr.friends) pushSocial(f); }
function pushParty(p) { for (const m of p.members) pushSocial(m); for (const i of p.invited) pushSocial(i); }
function leaveParty(c) {
  const p = c.party; if (!p) return;
  p.members.delete(c.user); c.party = null;
  if (!p.members.size) parties.delete(p.id);
  else if (p.leader === c.user) p.leader = [...p.members][0];
  pushParty(p); pushSocial(c.user);
}

// ---------- Räume (Mehrspieler) ----------
function leaveRoom(c) {
  const r = c.room; if (!r) return;
  r.players.delete(c); c.room = null; c.state = null;
  for (const o of r.players) send(o, { t: 'playerLeave', id: c.id });
  if (!r.players.size) rooms.delete(r.key);
  if (c.user) pushFriends(c.user);
}
function enterRoom(c, r) {
  r.players.add(c); c.room = r; c.state = null;
  send(c, { t: 'roomJoined', game: r.game, room: r.key, you: c.id, players: [...r.players].filter(o => o !== c).map(o => ({ id: o.id, name: D().users[o.user].name, look: lookOf(o.user) })) });
  for (const o of r.players) if (o !== c) send(o, { t: 'playerJoin', id: c.id, name: D().users[c.user].name, look: lookOf(c.user) });
  pushFriends(c.user);
}
// 10-mal pro Sekunde: Positionen an alle im Raum
setInterval(() => {
  for (const r of rooms.values()) {
    const list = [...r.players].filter(o => o.state).map(o => [o.id, o.state]);
    if (list.length) for (const o of r.players) send(o, { t: 'states', list: list.filter(x => x[0] !== o.id) });
  }
}, 100);

// ---------- Anmelden ----------
function loginAs(c, u) {
  const old = online.get(u);
  if (old && old !== c) { notice(old, 'Du wurdest abgemeldet, weil du dich woanders angemeldet hast.'); send(old, { t: 'kicked' }); logoutConn(old); }
  c.user = u; online.set(u, c);
  const token = crypto.randomBytes(24).toString('hex');
  D().tokens[token] = { u, exp: now() + TOKEN_DAYS * 864e5 };
  for (const [k, v] of Object.entries(D().tokens)) if (v.exp < now()) delete D().tokens[k];
  db.save();
  const usr = D().users[u];
  send(c, { t: 'auth', token, me: meOf(u) });
  pushSocial(u); pushFriends(u);
}
function logoutConn(c) {
  if (!c.user) return;
  const u = c.user;
  leaveRoom(c); leaveParty(c);
  for (const p of parties.values()) p.invited.delete(u);
  if (online.get(u) === c) online.delete(u);
  c.user = null;
  pushFriends(u);
}

// Schutz vor zu vielen Versuchen
const regByIp = new Map(), failByName = new Map(), codeTries = new Map();
function tooMany(map, key, limit, ms) {
  const list = (map.get(key) || []).filter(t => now() - t < ms);
  map.set(key, list);
  return list.length >= limit;
}

// ---------- Nachrichten ----------
function handle(c, m) {
  const users = D().users;
  if (m.t !== 'state' && m.t !== 'shot' && m.t !== 'hit') { c.count = (c.count || 0) + 1; if (c.count > 40) return err(c, 'Zu viele Anfragen, bitte kurz warten.'); }
  if (!c.user && !['register', 'login', 'resume'].includes(m.t)) return;
  switch (m.t) {
    case 'register': {
      const name = String(m.name || '').trim(), u = low(name), pw = String(m.password || '');
      const year = Math.round(Number(m.birthYear)), yNow = new Date().getFullYear();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return err(c, 'Benutzernamen: 3 bis 16 Zeichen, nur Buchstaben ohne Umlaute, Zahlen und _.');
      const pr = nameProblem(name); if (pr) return err(c, pr);
      if (users[u]) return err(c, 'Diesen Benutzernamen gibt es schon.');
      if (pw.length < 8 || pw.length > 100) return err(c, 'Das Passwort braucht mindestens 8 Zeichen.');
      if (!(year >= yNow - 100 && year <= yNow - 5)) return err(c, 'Bitte gib dein echtes Geburtsjahr ein.');
      if (tooMany(regByIp, c.ip, 5, 3600e3)) return err(c, 'Von hier wurden gerade zu viele Konten erstellt. Versuch es später nochmal.');
      regByIp.get(c.ip).push(now());
      users[u] = { name, pw: hashPw(pw), year, created: now(), profile: cleanProfile(m.profile), friends: [], requests: [] };
      db.save();
      return loginAs(c, u);
    }
    case 'login': {
      const u = low(m.name), usr = users[u];
      if (tooMany(failByName, u, 8, 600e3)) return err(c, 'Zu viele falsche Versuche. Warte 10 Minuten.');
      if (!usr || !checkPw(String(m.password || ''), usr.pw)) { failByName.get(u).push(now()); return err(c, 'Benutzername oder Passwort stimmt nicht.'); }
      return loginAs(c, u);
    }
    case 'resume': {
      const tk = D().tokens[String(m.token || '')];
      if (!tk || tk.exp < now() || !users[tk.u]) return send(c, { t: 'loggedOut' });
      delete D().tokens[String(m.token)];
      return loginAs(c, tk.u);
    }
    case 'logout': {
      if (m.token) delete D().tokens[String(m.token)];
      db.save(); logoutConn(c); return send(c, { t: 'loggedOut' });
    }
    case 'profile': {
      users[c.user].profile = cleanProfile(m.profile); db.save();
      if (c.room) for (const o of c.room.players) if (o !== c) send(o, { t: 'look', id: c.id, look: lookOf(c.user) });
      return;
    }
    case 'friendRequest': {
      const t = low(m.name), me = users[c.user], other = users[t];
      if (!other) return err(c, 'Diesen Benutzernamen gibt es nicht.');
      if (t === c.user) return err(c, 'Dich selbst kannst du nicht hinzufügen.');
      if (me.friends.includes(t)) return err(c, other.name + ' ist schon dein Freund.');
      if (me.requests.includes(t)) { // die andere Person hat schon gefragt: direkt Freunde
        me.requests = me.requests.filter(x => x !== t); me.friends.push(t); other.friends.push(c.user);
        db.save(); pushSocial(c.user); pushSocial(t); return notice(c, 'Ihr seid jetzt Freunde!');
      }
      if (!other.requests.includes(c.user)) { other.requests.push(c.user); other.requests = other.requests.slice(-50); }
      db.save(); pushSocial(t);
      const oc = online.get(t); if (oc) notice(oc, me.name + ' möchte dein Freund sein.');
      return notice(c, 'Anfrage an ' + other.name + ' geschickt.');
    }
    case 'friendAnswer': {
      const t = low(m.name), me = users[c.user], other = users[t];
      if (!me.requests.includes(t)) return;
      me.requests = me.requests.filter(x => x !== t);
      if (m.accept && other && me.friends.length < 300) {
        me.friends.push(t); if (!other.friends.includes(c.user)) other.friends.push(c.user);
        const oc = online.get(t); if (oc) notice(oc, me.name + ' hat deine Anfrage angenommen.');
      }
      db.save(); pushSocial(c.user); return pushSocial(t);
    }
    case 'friendRemove': {
      const t = low(m.name), me = users[c.user], other = users[t];
      me.friends = me.friends.filter(x => x !== t);
      if (other) other.friends = other.friends.filter(x => x !== c.user);
      db.save(); pushSocial(c.user); return pushSocial(t);
    }
    case 'partyCreate': {
      leaveParty(c);
      const p = { id: nextId++, leader: c.user, members: new Set([c.user]), invited: new Set() };
      parties.set(p.id, p); c.party = p; return pushSocial(c.user);
    }
    case 'partyInvite': {
      const p = c.party, t = low(m.name);
      if (!p) return err(c, 'Gründe zuerst eine Gruppe.');
      if (!users[c.user].friends.includes(t)) return err(c, 'Du kannst nur Freunde einladen.');
      if (p.members.has(t)) return;
      if (p.members.size >= 8) return err(c, 'Die Gruppe ist voll (8 Leute).');
      p.invited.add(t); pushSocial(t);
      const oc = online.get(t); if (oc) notice(oc, users[c.user].name + ' lädt dich in eine Gruppe ein.');
      return notice(c, 'Einladung an ' + users[t].name + ' geschickt.');
    }
    case 'partyAnswer': {
      const p = parties.get(Number(m.id));
      if (!p || !p.invited.has(c.user)) return err(c, 'Diese Einladung gibt es nicht mehr.');
      p.invited.delete(c.user);
      if (m.accept) { if (c.party !== p) leaveParty(c); p.members.add(c.user); c.party = p; }
      return pushParty(p), pushSocial(c.user);
    }
    case 'partyLeave': return leaveParty(c);
    case 'claimCreator': {
      if (tooMany(codeTries, c.user, 5, 600e3)) return err(c, 'Zu viele Versuche. Warte 10 Minuten.');
      codeTries.get(c.user).push(now());
      if (!CREATOR_CODE) return err(c, 'Auf dem Server ist noch kein Erfinder-Code eingestellt (CREATOR_CODE bei Render).');
      // Groß- und Kleinschreibung egal, weil Handy-Tastaturen oft den ersten Buchstaben groß machen
      const a = Buffer.from(String(m.code || '').trim().toLowerCase()), b = Buffer.from(CREATOR_CODE.toLowerCase());
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return err(c, 'Der Code stimmt nicht.');
      if (users[c.user].role !== 'creator' && mainCount() >= MAX_MAIN) return err(c, 'Es gibt schon ' + MAX_MAIN + ' Haupt-Erfinder. Mehr geht nicht.');
      users[c.user].role = 'creator';
      if (!ownerOk()) D().owner = c.user; // der Erste wird Gründer
      db.save();
      send(c, { t: 'me', me: meOf(c.user) }); send(c, adminData());
      return notice(c, D().owner === c.user ? 'Du bist jetzt Haupt-Erfinder (Gründer)!' : 'Du bist jetzt Haupt-Erfinder!');
    }
    case 'giftCoins': {
      if (roleOf(c.user) !== 'creator') return err(c, 'Münzen schenken können nur Haupt-Erfinder.');
      const t = low(m.name), other = users[t], n = Math.round(num(m.coins, 0, 1e6, 0)), take = !!m.take;
      if (!other) return err(c, 'Diesen Benutzernamen gibt es nicht.');
      if (n < 1) return err(c, 'Gib eine Anzahl zwischen 1 und 1000000 ein.');
      other.profile = cleanProfile(other.profile);
      const had = other.profile.coins, delta = take ? -Math.min(n, had) : n;
      other.profile.coins = Math.min(1e7, had + delta);
      const oc = online.get(t);
      if (oc) send(oc, { t: 'gift', coins: take ? -n : n, from: users[c.user].name });
      else if (!take) { other.mail = other.mail || []; other.mail.push({ text: '🎁 ' + users[c.user].name + ' hat dir ' + n + ' Münzen geschenkt!', at: now(), read: false }); }
      db.save(); return notice(c, take ? other.name + ' wurden ' + n + ' Münzen weggenommen.' : other.name + ' hat ' + n + ' Münzen bekommen.');
    }
    case 'adminList': if (isAdminU(c.user)) send(c, adminData()); return;
    case 'adminAdd': {
      if (!isAdminU(c.user)) return err(c, 'Das dürfen nur Admins.');
      const t = low(m.name), other = users[t];
      if (!other) return err(c, 'Diesen Benutzernamen gibt es nicht.');
      if (m.main) {
        if (roleOf(c.user) !== 'creator') return err(c, 'Haupt-Erfinder machen können nur Haupt-Erfinder.');
        if (other.role === 'creator') return err(c, other.name + ' ist schon Haupt-Erfinder.');
        if (mainCount() >= MAX_MAIN) return err(c, 'Es gibt schon ' + MAX_MAIN + ' Haupt-Erfinder. Mehr geht nicht.');
        other.role = 'creator'; db.save();
        const oc = online.get(t); if (oc) { send(oc, { t: 'me', me: meOf(t) }); notice(oc, users[c.user].name + ' hat dich zum Haupt-Erfinder gemacht!'); }
        pushAdmins(); return notice(c, other.name + ' ist jetzt Haupt-Erfinder.');
      }
      if (other.role) return err(c, other.name + ' ist schon Admin.');
      other.role = 'admin'; db.save();
      const oc = online.get(t); if (oc) { send(oc, { t: 'me', me: meOf(t) }); notice(oc, users[c.user].name + ' hat dich zum Admin gemacht!'); }
      pushAdmins(); return notice(c, other.name + ' ist jetzt Admin.');
    }
    case 'adminRemove': {
      if (roleOf(c.user) !== 'creator') return err(c, 'Admins löschen können nur Haupt-Erfinder.');
      const t = low(m.name), other = users[t];
      if (!other) return err(c, 'Diesen Benutzernamen gibt es nicht.');
      if (t === c.user) return err(c, 'Dich selbst kannst du nicht löschen.');
      // Der Haupt-Erfinder darf auch andere Erfinder löschen
      if (other.role === 'creator' && D().owner !== c.user) return err(c, 'Haupt-Erfinder löschen kann nur der Gründer.');
      if (other.role === 'creator') { delete other.role; db.save(); const oc = online.get(t); if (oc) { send(oc, { t: 'me', me: meOf(t) }); notice(oc, 'Du bist kein Haupt-Erfinder mehr.'); } pushAdmins(); return notice(c, other.name + ' ist kein Haupt-Erfinder mehr.'); }
      if (other.role !== 'admin') return err(c, other.name + ' ist kein Admin.');
      delete other.role; db.save();
      const oc = online.get(t); if (oc) { send(oc, { t: 'me', me: meOf(t) }); notice(oc, 'Du bist kein Admin mehr.'); }
      pushAdmins(); return notice(c, other.name + ' ist kein Admin mehr.');
    }
    case 'ban': {
      if (roleOf(c.user) !== 'creator') return err(c, 'Bannen dürfen nur Haupt-Erfinder.');
      const t = low(m.name), other = users[t], g = String(m.game);
      if (!other || !GAMES[g]) return err(c, 'Diesen Spieler gibt es nicht.');
      if (isAdminU(t)) return err(c, 'Admins kann man nicht bannen.');
      D().bans[g] = D().bans[g] || [];
      if (!D().bans[g].some(b => b.u === t)) D().bans[g].push({ u: t, by: users[c.user].name, at: now() });
      db.save();
      const oc = online.get(t);
      if (oc) { send(oc, { t: 'banned', game: g, by: users[c.user].name }); send(oc, { t: 'me', me: meOf(t) }); if (oc.room && oc.room.game === g) leaveRoom(oc); }
      pushAdmins(); return notice(c, other.name + ' wurde aus ' + GAMES[g] + ' gebannt.');
    }
    case 'unban': {
      if (roleOf(c.user) !== 'creator') return err(c, 'Zurückholen dürfen nur Haupt-Erfinder.');
      const t = low(m.name), g = String(m.game), list = D().bans[g] || [];
      if (!list.some(b => b.u === t)) return;
      D().bans[g] = list.filter(b => b.u !== t);
      if (users[t]) {
        users[t].mail = (users[t].mail || []).slice(-20);
        users[t].mail.push({ text: 'Gute Nachricht! Du darfst wieder in „' + GAMES[g] + '“ spielen. Viel Spaß und bleib fair!', at: now(), read: false });
        const oc = online.get(t); if (oc) send(oc, { t: 'me', me: meOf(t) });
      }
      db.save(); pushAdmins(); return notice(c, (users[t] ? users[t].name : t) + ' darf wieder in ' + GAMES[g] + '.');
    }
    case 'mailRead': { for (const ml of users[c.user].mail || []) ml.read = true; db.save(); return; }
    case 'join': {
      if (!GAMES[m.game]) return;
      if (bansOf(c.user).includes(m.game)) return send(c, { t: 'banned', game: m.game, by: null });
      { const usr = D().users[c.user]; if (usr && GAME_AGE[m.game] && !usr.role && new Date().getFullYear() - usr.year < GAME_AGE[m.game]) return err(c, GAMES[m.game] + ' ist erst ab ' + GAME_AGE[m.game] + ' Jahren.'); }
      leaveRoom(c);
      let r = m.room ? rooms.get(String(m.room)) : null;
      if (!r || r.game !== m.game || r.players.size >= ROOM_MAX) r = [...rooms.values()].find(x => x.game === m.game && x.players.size < ROOM_MAX);
      if (!r) { r = { key: m.game + '-' + (nextId++), game: m.game, players: new Set() }; rooms.set(r.key, r); }
      enterRoom(c, r);
      // Die Gruppe kommt mit, wenn der Gruppenleiter ein Spiel startet
      const p = c.party;
      if (p && p.leader === c.user) for (const mu of p.members) {
        const mc = online.get(mu);
        if (mu !== c.user && mc && (!mc.room || mc.room.key !== r.key)) send(mc, { t: 'partyGo', game: m.game, room: r.key, from: users[c.user].name });
      }
      return;
    }
    case 'leave': return leaveRoom(c);
    case 'state': {
      if (!c.room || !m.s || typeof m.s !== 'object') return;
      const s = m.s, st = { x: num(s.x, -500, 500, 0), y: num(s.y, -100, 200, 0), z: num(s.z, -500, 500, 0), f: num(s.f, -50, 50, 0), m: s.m ? 1 : 0, a: s.a ? 1 : 0, d: s.d ? 1 : 0 };
      if (s.c !== undefined && s.c !== null) { st.c = num(s.c, -1e4, 1e4, 0); st.v = Math.round(num(s.v, 0, 9, 0)); st.w = num(s.w, 0, 1, 0); }
      if (s.p) st.p = Math.round(num(s.p, 0, 9, 0));
      c.state = st; return;
    }
    // Kämpfen gegen andere Spieler im selben Raum (Box-Ring, Blaster-Arena)
    case 'hit': case 'ko': case 'shot': {
      const r = c.room;
      if (!r || !['fight', 'blaster'].includes(r.game)) return;
      const name = D().users[c.user].name;
      if (m.t === 'shot') {
        const v = a => Array.isArray(a) && a.length === 3 ? a.map(x => num(x, -500, 500, 0)) : null, a = v(m.a), b = v(m.b);
        if (!a || !b) return;
        const t1 = now(); if (t1 - (c.lastShot || 0) < 50) return; c.lastShot = t1;
        for (const o of r.players) if (o !== c) send(o, { t: 'shot', a, b, col: Math.round(num(m.col, 0, 0xffffff, 0xffffff)) });
        return;
      }
      const target = [...r.players].find(o => o.id === Number(m.id) && o !== c);
      if (!target) return;
      if (m.t === 'hit') {
        const t0 = now(); if (t0 - (c.lastHit || 0) < 60) return; c.lastHit = t0;
        return send(target, { t: 'hit', from: name, id: c.id, dmg: Math.round(num(m.dmg, 1, 25, 5)), up: m.up ? 1 : 0 });
      }
      return send(target, { t: 'ko', from: name });
    }
  }
}

// ---------- Verbindungen ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024, verifyClient: info => hasAccess(info.req) });
wss.on('connection', (ws, req) => {
  const c = { ws, id: nextId++, user: null, room: null, state: null, party: null, count: 0, alive: true, ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() };
  clients.add(c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m && typeof m.t === 'string') handle(c, m); });
  ws.on('close', () => { logoutConn(c); clients.delete(c); });
});
setInterval(() => { for (const c of clients) c.count = 0; }, 1000);
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false; try { c.ws.ping(); } catch (e) {}
  }
}, 30000);

db.load().then(() => {
  server.listen(PORT, () => console.log('Klotzwelt läuft auf Port ' + PORT));
}).catch(e => { console.error('Start fehlgeschlagen:', e.message); process.exit(1); });

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await db.flush(); process.exit(0); });
