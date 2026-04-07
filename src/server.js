"use strict";

const express   = require("express");
const BotConfig = require("./models/BotConfig");
const BotUrl    = require("./models/BotUrl");
const { getEntries } = require("./activityLog");

const app      = express();
const PASSWORD = process.env.BOT_ADMIN_PASSWORD || "savorbot";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers["x-admin-password"] || req.query.p;
  if (token === PASSWORD) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ── Dashboard HTML ────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Savor Bot</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fafaf7;
      color: #1a1a1a;
      min-height: 100vh;
    }
    .login-wrap {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
    }
    .login-card {
      background: white; border-radius: 16px; padding: 40px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08); width: 320px;
      text-align: center;
    }
    .login-card h1 { font-size: 28px; margin-bottom: 8px; }
    .login-card p  { color: #666; margin-bottom: 24px; font-size: 14px; }
    input[type=password] {
      width: 100%; padding: 12px 16px; border: 1.5px solid #e0e0e0;
      border-radius: 10px; font-size: 15px; outline: none;
      transition: border-color 0.2s;
    }
    input[type=password]:focus { border-color: #FF6D00; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 20px; border-radius: 10px; border: none;
      font-size: 14px; font-weight: 600; cursor: pointer;
      transition: opacity 0.15s; text-decoration: none;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary   { background: #FF6D00; color: white; }
    .btn-danger    { background: #d32752; color: white; }
    .btn-neutral   { background: #e8e8e4; color: #333; }
    .btn-full      { width: 100%; justify-content: center; margin-top: 12px; }
    .btn-sm        { padding: 6px 14px; font-size: 13px; }
    header {
      background: white; border-bottom: 1px solid #ebebeb;
      padding: 16px 32px; display: flex; align-items: center;
      justify-content: space-between;
    }
    header h1 { font-size: 20px; }
    header span { font-size: 13px; color: #888; }
    .container { max-width: 960px; margin: 0 auto; padding: 32px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 700px) { .grid-2 { grid-template-columns: 1fr; } }
    .card {
      background: white; border-radius: 16px; padding: 24px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.05);
    }
    .card h2 { font-size: 15px; font-weight: 700; margin-bottom: 18px; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
    .status-row {
      display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
    }
    .dot {
      width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
    }
    .dot-green  { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.2); }
    .dot-red    { background: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.2); }
    .dot-orange { background: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.2); }
    .status-label { font-size: 16px; font-weight: 600; }
    .speed-row { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
    .speed-btn {
      flex: 1; padding: 10px; border: 2px solid #e8e8e4;
      border-radius: 10px; background: white; cursor: pointer;
      font-size: 13px; font-weight: 600; transition: all 0.15s;
      min-width: 80px;
    }
    .speed-btn:hover    { border-color: #FF6D00; }
    .speed-btn.active   { border-color: #FF6D00; background: #fff4ee; color: #FF6D00; }
    .action-row { display: flex; gap: 8px; }
    .log-wrap {
      max-height: 380px; overflow-y: auto;
      font-family: "SF Mono", "Fira Code", monospace; font-size: 12px;
    }
    .log-entry {
      padding: 8px 0; border-bottom: 1px solid #f0f0f0;
      display: grid; grid-template-columns: 140px 1fr; gap: 8px;
    }
    .log-entry:last-child { border-bottom: none; }
    .log-ts    { color: #aaa; font-size: 11px; padding-top: 1px; }
    .log-body  { color: #333; }
    .log-detail { color: #888; font-size: 11px; margin-top: 2px; }
    .log-share { color: #22c55e; }
    .log-like  { color: #ef4444; }
    .log-save  { color: #3b82f6; }
    .log-error { color: #d32752; }
    .log-warn  { color: #f97316; }
    .url-list  { list-style: none; }
    .url-item  {
      padding: 10px 0; border-bottom: 1px solid #f0f0f0;
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px;
    }
    .url-item:last-child { border-bottom: none; }
    .url-text  { font-size: 13px; color: #555; word-break: break-all; flex: 1; }
    .url-text.failed { text-decoration: line-through; color: #bbb; }
    .badge {
      font-size: 11px; font-weight: 600; padding: 2px 8px;
      border-radius: 6px; white-space: nowrap;
    }
    .badge-ok     { background: #dcfce7; color: #16a34a; }
    .badge-failed { background: #fee2e2; color: #dc2626; }
    .url-add-row  { display: flex; gap: 8px; margin-top: 16px; }
    .url-add-row input {
      flex: 1; padding: 10px 14px; border: 1.5px solid #e0e0e0;
      border-radius: 10px; font-size: 13px; outline: none;
    }
    .url-add-row input:focus { border-color: #FF6D00; }
    .stats-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
    }
    .stat-box {
      background: #fafaf7; border-radius: 10px; padding: 14px;
      text-align: center;
    }
    .stat-val  { font-size: 26px; font-weight: 700; color: #FF6D00; }
    .stat-lbl  { font-size: 12px; color: #888; margin-top: 2px; }
    .empty     { color: #aaa; font-size: 13px; text-align: center; padding: 24px 0; }
    #error-msg { color: #d32752; font-size: 13px; margin-top: 8px; min-height: 20px; }
  </style>
</head>
<body>

<!-- Login screen -->
<div class="login-wrap" id="login-screen">
  <div class="login-card">
    <h1>🌿 Savor Bot</h1>
    <p>Enter your admin password to continue</p>
    <input type="password" id="pw-input" placeholder="Password" />
    <p id="error-msg"></p>
    <button class="btn btn-primary btn-full" onclick="login()">Sign in</button>
  </div>
</div>

<!-- Main dashboard (hidden until auth) -->
<div id="dashboard" style="display:none">
  <header>
    <h1>🌿 Savor Bot</h1>
    <span id="header-status">Loading...</span>
  </header>

  <div class="container">
    <div class="grid-2">

      <!-- Status & Controls -->
      <div class="card">
        <h2>Bot Controls</h2>
        <div class="status-row">
          <div class="dot" id="status-dot"></div>
          <span class="status-label" id="status-label">Loading...</span>
        </div>
        <div class="speed-row">
          <button class="speed-btn" id="speed-quiet"  onclick="setSpeed('quiet')">🐢 Quiet</button>
          <button class="speed-btn" id="speed-normal" onclick="setSpeed('normal')">🚶 Normal</button>
          <button class="speed-btn" id="speed-active" onclick="setSpeed('active')">🐇 Active</button>
        </div>
        <div class="action-row">
          <button class="btn btn-primary" style="flex:1" onclick="togglePause()" id="pause-btn">Loading...</button>
        </div>
      </div>

      <!-- Stats -->
      <div class="card">
        <h2>Stats</h2>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-val" id="stat-urls">—</div>
            <div class="stat-lbl">Active URLs</div>
          </div>
          <div class="stat-box">
            <div class="stat-val" id="stat-shares">—</div>
            <div class="stat-lbl">Bot Shares</div>
          </div>
          <div class="stat-box">
            <div class="stat-val" id="stat-bots">—</div>
            <div class="stat-lbl">Bot Users</div>
          </div>
        </div>
      </div>

    </div>

    <!-- Activity log -->
    <div class="card" style="margin-top:24px">
      <h2>Activity Log <span style="font-weight:400;color:#aaa;font-size:12px;text-transform:none;letter-spacing:0">(last 100 events, resets on restart)</span></h2>
      <div class="log-wrap" id="log-list">
        <div class="empty">Loading...</div>
      </div>
    </div>

    <!-- URL management -->
    <div class="card" style="margin-top:24px">
      <h2>URL Pool</h2>
      <ul class="url-list" id="url-list">
        <li class="empty">Loading...</li>
      </ul>
      <div class="url-add-row">
        <input type="text" id="url-input" placeholder="https://www.bbcgoodfood.com/recipes/..." />
        <button class="btn btn-primary" onclick="addUrl()">Add URL</button>
      </div>
    </div>

  </div>
</div>

<script>
  let password = "";

  function login() {
    password = document.getElementById("pw-input").value;
    fetch("/api/status", { headers: { "x-admin-password": password } })
      .then(r => {
        if (r.status === 401) {
          document.getElementById("error-msg").textContent = "Wrong password";
          return;
        }
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("dashboard").style.display = "block";
        loadAll();
        setInterval(loadAll, 15000);
      });
  }

  document.getElementById("pw-input").addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });

  function api(path, opts = {}) {
    return fetch(path, {
      ...opts,
      headers: { "x-admin-password": password, "Content-Type": "application/json", ...(opts.headers || {}) },
    }).then(r => r.json());
  }

  function loadAll() {
    api("/api/status").then(data => {
      const paused = data.paused;
      const speed  = data.speed;

      document.getElementById("header-status").textContent =
        paused ? "⏸ Paused" : "▶ Running";

      const dot   = document.getElementById("status-dot");
      const label = document.getElementById("status-label");
      dot.className   = "dot " + (paused ? "dot-orange" : "dot-green");
      label.textContent = paused ? "Paused" : "Running";

      document.getElementById("pause-btn").textContent =
        paused ? "▶ Resume" : "⏸ Pause";

      ["quiet","normal","active"].forEach(s => {
        document.getElementById("speed-" + s).classList.toggle("active", s === speed);
      });

      document.getElementById("stat-urls").textContent   = data.activeUrls;
      document.getElementById("stat-shares").textContent = data.botShares;
      document.getElementById("stat-bots").textContent   = data.botUsers;
    });

    api("/api/log").then(data => {
      const list = document.getElementById("log-list");
      if (!data.entries?.length) {
        list.innerHTML = '<div class="empty">No activity yet</div>';
        return;
      }
      list.innerHTML = data.entries.map(e => {
        const cls = ["share","like","save","error","warn"].includes(e.type) ? "log-" + e.type : "";
        const ts  = e.ts.replace("T"," ").slice(0,19);
        return \`<div class="log-entry">
          <div class="log-ts">\${ts}</div>
          <div>
            <div class="log-body \${cls}">\${e.message}</div>
            \${e.detail ? \`<div class="log-detail">\${e.detail}</div>\` : ""}
          </div>
        </div>\`;
      }).join("");
    });

    api("/api/urls").then(data => {
      const list = document.getElementById("url-list");
      if (!data.urls?.length) {
        list.innerHTML = '<li class="empty">No URLs yet — add one below</li>';
        return;
      }
      list.innerHTML = data.urls.map(u => {
        const domain = (() => { try { return new URL(u.url).hostname.replace("www.",""); } catch { return u.url; } })();
        const badge  = u.failed
          ? '<span class="badge badge-failed">failed</span>'
          : '<span class="badge badge-ok">active</span>';
        const cls    = u.failed ? "failed" : "";
        return \`<li class="url-item">
          <span class="url-text \${cls}" title="\${u.url}">\${domain} — \${u.url.slice(0,60)}\${u.url.length>60?"…":""}</span>
          \${badge}
          <button class="btn btn-neutral btn-sm" onclick="resetUrl('\${u._id}')">Reset</button>
          <button class="btn btn-danger btn-sm"  onclick="removeUrl('\${u._id}')">✕</button>
        </li>\`;
      }).join("");
    });
  }

  function togglePause() {
    api("/api/status").then(d => {
      api("/api/control", {
        method: "POST",
        body: JSON.stringify({ paused: !d.paused }),
      }).then(loadAll);
    });
  }

  function setSpeed(s) {
    api("/api/control", {
      method: "POST",
      body: JSON.stringify({ speed: s }),
    }).then(loadAll);
  }

  function addUrl() {
    const url = document.getElementById("url-input").value.trim();
    if (!url) return;
    api("/api/urls", {
      method: "POST",
      body: JSON.stringify({ url }),
    }).then(() => {
      document.getElementById("url-input").value = "";
      loadAll();
    });
  }

  function resetUrl(id) {
    api(\`/api/urls/\${id}/reset\`, { method: "POST" }).then(loadAll);
  }

  function removeUrl(id) {
    if (!confirm("Remove this URL?")) return;
    api(\`/api/urls/\${id}\`, { method: "DELETE" }).then(loadAll);
  }
</script>
</body>
</html>`);
});

// ── API routes ────────────────────────────────────────────────────────────────

// Status + stats
app.get("/api/status", requireAuth, async (req, res) => {
  try {
    const Recipe = require("./models/Recipe");
    const UserFb = require("./models/UserFB");

    const config     = await BotConfig.get();
    const activeUrls = await BotUrl.countDocuments({ verified: { $ne: null }, failed: false });
    const botShares  = await Recipe.countDocuments({ isShared: true, user: { $in: await UserFb.distinct("_id", { firebaseUID: /^bot_user_/ }) } });
    const botUsers   = await UserFb.countDocuments({ firebaseUID: /^bot_user_/ });

    res.json({ speed: config.speed, paused: config.paused, activeUrls, botShares, botUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update config (pause / speed)
app.post("/api/control", requireAuth, async (req, res) => {
  try {
    const { paused, speed } = req.body;
    const updates = {};
    if (paused  !== undefined) updates.paused = paused;
    if (speed   !== undefined) updates.speed  = speed;
    const config = await BotConfig.set(updates);
    res.json({ ok: true, paused: config.paused, speed: config.speed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activity log
app.get("/api/log", requireAuth, (req, res) => {
  res.json({ entries: getEntries() });
});

// List URLs
app.get("/api/urls", requireAuth, async (req, res) => {
  try {
    const urls = await BotUrl.find().sort({ addedAt: -1 });
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add URL
app.post("/api/urls", requireAuth, async (req, res) => {
  try {
    const { url, note } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });

    const existing = await BotUrl.findOne({ url });
    if (existing) return res.status(409).json({ error: "URL already exists" });

    const entry = await BotUrl.create({
      url,
      verified: new Date().toISOString().slice(0, 10),
      note: note || "",
    });
    res.json({ ok: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset URL (clear failed/failCount)
app.post("/api/urls/:id/reset", requireAuth, async (req, res) => {
  try {
    await BotUrl.findByIdAndUpdate(req.params.id, { failed: false, failCount: 0 });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove URL
app.delete("/api/urls/:id", requireAuth, async (req, res) => {
  try {
    await BotUrl.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Manual harvest trigger ────────────────────────────────────────────────────
app.post("/api/harvest", requireAuth, (req, res) => {
  const { harvestUrls } = require("./bot");
  res.json({ ok: true, message: "Harvest started — check the activity log" });
  // Fire and forget — runs in background, logs to activity log
  harvestUrls().catch(err => console.error("Manual harvest error:", err.message));
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ ok: true }));

function startServer() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`${new Date().toISOString()}  🖥️  Dashboard at http://localhost:${port}`);
  });
}

module.exports = { startServer };