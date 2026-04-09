/**
 * brainsait-portals — BrainSAIT Healthcare Control Tower
 * Migrated from Fadil369/oracle-setup into the solutions monorepo.
 *
 * Routes: portals.elfadil.com/*
 * Bindings: PORTAL_KV, SCANNER_SERVICE (service binding)
 * Cron: */5 * * * * — health probe for all 6 hospital branches
 *
 * Exposes:
 *   GET  /                    → Control Tower HTML dashboard
 *   GET  /health              → Liveness probe
 *   GET  /api/health          → JSON health of all branches
 *   GET  /api/health/:branch  → JSON health of one branch
 *   GET  /api/branches        → Branch registry
 *   GET  /api/runbooks        → Runbook index
 *   GET  /runbooks/:id        → Runbook HTML page
 *   [Protected with X-API-Key]
 *   GET  /api/control-tower   → Full snapshot
 *   *    /api/scan/:branch    → Proxy to oracle-claim-scanner
 */

import { verifyApiKey, corsHeaders, errorResponse, jsonResponse } from '../../packages/auth/src/index.js';

const HEALTH_CACHE_TTL = 6 * 60; // 6 minutes in seconds

/** Hospital branch registry */
const BRANCHES = [
  { id: 'riyadh',  name: 'الرياض',   nameEn: 'Riyadh',        url: 'https://oracle-riyadh.elfadil.com',  loginPath: '/prod/faces/Home',            probeMs: 8000 },
  { id: 'madinah', name: 'المدينة',  nameEn: 'Madinah',       url: 'https://oracle-madinah.elfadil.com', loginPath: '/Oasis/faces/Login.jsf',       probeMs: 8000 },
  { id: 'unaizah', name: 'عنيزة',    nameEn: 'Unaizah',       url: 'https://oracle-unaizah.elfadil.com', loginPath: '/prod/faces/Login.jsf',        probeMs: 8000 },
  { id: 'khamis',  name: 'خميس',     nameEn: 'Khamis Mushait',url: 'https://oracle-khamis.elfadil.com',  loginPath: '/prod/faces/Login.jsf',        probeMs: 8000 },
  { id: 'jizan',   name: 'جازان',    nameEn: 'Jizan',         url: 'https://oracle-jizan.elfadil.com',   loginPath: '/prod/faces/Login.jsf',        probeMs: 12000 },
  { id: 'abha',    name: 'أبها',     nameEn: 'Abha',          url: 'https://oracle-abha.elfadil.com',    loginPath: '/Oasis/faces/Home',            probeMs: 8000 },
];

/** Operational runbooks */
const RUNBOOKS = [
  { id: 'hospital-connectivity',       title: 'Restore Hospital Portal Connectivity',             owner: 'Infrastructure Agent' },
  { id: 'hospital-latency',            title: 'Reduce Hospital Portal Latency',                   owner: 'Infrastructure Agent' },
  { id: 'external-service-availability', title: 'Handle External Healthcare Service Outage',      owner: 'Integration Gateway' },
  { id: 'nphies-availability',         title: 'Stabilize NPHIES Availability',                    owner: 'Claims Agent' },
  { id: 'claims-recode-96092',         title: 'Clear 96092-ERR Blocker Claims',                   owner: 'Claims Coding' },
  { id: 'claims-deadline-submission',  title: 'Move Ready Claims Before Appeal Deadline',         owner: 'Revenue Recovery' },
  { id: 'claims-prior-auth',           title: 'Work the Prior Authorization Appeal Queue',        owner: 'Claims Agent' },
  { id: 'scanner-http-404',            title: 'Repair Oracle Scan Batch HTTP 404 Failures',       owner: 'Integration Gateway' },
];

export default {
  /** HTTP request handler */
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin');
    const path   = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // ── Public endpoints ──────────────────────────────────────────
    if (path === '/' || path === '') return _dashboardHtml(env);
    if (path === '/health') return jsonResponse({ status: 'ok', worker: 'brainsait-portals', ts: Date.now() });
    if (path === '/api/health') return _getHealth(env, origin);
    if (path.startsWith('/api/health/')) return _getBranchHealth(path.slice(12), env, origin);
    if (path === '/api/branches') return jsonResponse(BRANCHES.map(b => ({ id: b.id, name: b.name, nameEn: b.nameEn, url: b.url })), 200, origin);
    if (path === '/api/runbooks') return jsonResponse(RUNBOOKS, 200, origin);
    if (path.startsWith('/runbooks/')) return _runbookHtml(path.slice(10), env);

    // ── Protected endpoints ───────────────────────────────────────
    if (!verifyApiKey(request, env.API_KEY)) {
      return errorResponse('Unauthorized', 401, origin);
    }

    if (path === '/api/control-tower') return _controlTowerSnapshot(env, origin);

    const scanMatch = path.match(/^\/api\/scan\/(.+)$/);
    if (scanMatch) return _proxyScan(scanMatch[1], request, env, origin);

    return errorResponse('Not found', 404, origin);
  },

  /** Scheduled cron: probe all branches and cache results */
  async scheduled(event, env) {
    await _probeAllBranches(env);
  },
};

async function _getHealth(env, origin) {
  const cached = await env.PORTAL_KV.get('health:all', { type: 'json' });
  if (cached) return jsonResponse(cached, 200, origin);
  const fresh = await _probeAllBranches(env);
  return jsonResponse(fresh, 200, origin);
}

async function _getBranchHealth(branchId, env, origin) {
  const branch = BRANCHES.find(b => b.id === branchId);
  if (!branch) return errorResponse(`Unknown branch: ${branchId}`, 404, origin);
  const result = await _probeBranch(branch);
  return jsonResponse(result, 200, origin);
}

async function _controlTowerSnapshot(env, origin) {
  const [health, claims] = await Promise.all([
    env.PORTAL_KV.get('health:all', { type: 'json' }),
    env.SCANNER_SERVICE?.fetch(new Request('https://oracle-scanner.elfadil.com/control-tower/claims'))
      .then(r => r.json()).catch(() => null),
  ]);
  return jsonResponse({ health, claims, ts: Date.now() }, 200, origin);
}

async function _proxyScan(branchId, request, env, origin) {
  if (!env.SCANNER_SERVICE) return errorResponse('Scanner service not configured', 503, origin);
  const scanReq = new Request(`https://oracle-scanner.elfadil.com/scan`, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ hospitalId: branchId }),
  });
  const res = await env.SCANNER_SERVICE.fetch(scanReq);
  const data = await res.json();
  return jsonResponse(data, res.status, origin);
}

async function _probeAllBranches(env) {
  const results = await Promise.allSettled(BRANCHES.map(_probeBranch));
  const health = results.map((r, i) => r.status === 'fulfilled' ? r.value : { id: BRANCHES[i].id, status: 'error', error: r.reason?.message });
  const summary = { branches: health, probedAt: new Date().toISOString() };
  await env.PORTAL_KV.put('health:all', JSON.stringify(summary), { expirationTtl: HEALTH_CACHE_TTL });
  return summary;
}

async function _probeBranch(branch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), branch.probeMs);
  try {
    const res = await fetch(`${branch.url}${branch.loginPath}`, { signal: controller.signal });
    clearTimeout(timer);
    return { id: branch.id, nameEn: branch.nameEn, status: res.ok ? 'online' : 'degraded', httpStatus: res.status, probedAt: Date.now() };
  } catch (err) {
    clearTimeout(timer);
    return { id: branch.id, nameEn: branch.nameEn, status: 'offline', error: err.message, probedAt: Date.now() };
  }
}

function _dashboardHtml(env) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BrainSAIT Control Tower</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
    header { background: linear-gradient(135deg, #1e293b, #0f172a); padding: 2rem; border-bottom: 1px solid #334155; }
    h1 { font-size: 1.8rem; font-weight: 700; color: #38bdf8; }
    .subtitle { color: #94a3b8; margin-top: 0.5rem; }
    main { padding: 2rem; display: grid; gap: 1.5rem; max-width: 1400px; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; border: 1px solid #334155; }
    .card h2 { font-size: 1.1rem; color: #94a3b8; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.1em; }
    .branch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
    .branch { background: #0f172a; border-radius: 8px; padding: 1rem; border: 1px solid #1e293b; }
    .branch-name { font-weight: 600; font-size: 1rem; }
    .branch-name-ar { font-size: 0.85rem; color: #94a3b8; direction: rtl; }
    .status { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; margin-top: 0.5rem; }
    .online { background: #14532d; color: #4ade80; }
    .offline { background: #450a0a; color: #f87171; }
    .loading { background: #1e3a5f; color: #60a5fa; }
    .btn { display: inline-block; padding: 0.5rem 1rem; border-radius: 8px; background: #0ea5e9; color: white; font-size: 0.9rem; text-decoration: none; cursor: pointer; border: none; }
  </style>
</head>
<body>
  <header>
    <h1>🏥 BrainSAIT Control Tower</h1>
    <p class="subtitle">Real-time monitoring for 6 hospital branches — NPHIES · FHIR R4 · Oracle ERP</p>
  </header>
  <main>
    <div class="card">
      <h2>Hospital Status</h2>
      <div class="branch-grid" id="branches">
        ${BRANCHES.map(b => `
        <div class="branch" id="branch-${b.id}">
          <div class="branch-name">${b.nameEn}</div>
          <div class="branch-name-ar">${b.name}</div>
          <span class="status loading">Probing...</span>
        </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <h2>Quick Actions</h2>
      <a href="/api/health" class="btn">Health JSON</a>
      &nbsp;
      <a href="/api/branches" class="btn">Branches JSON</a>
      &nbsp;
      <a href="/api/runbooks" class="btn">Runbooks</a>
    </div>
  </main>
  <script>
    fetch('/api/health').then(r => r.json()).then(data => {
      (data.branches ?? []).forEach(b => {
        const el = document.querySelector('#branch-' + b.id + ' .status');
        if (el) { el.textContent = b.status; el.className = 'status ' + b.status; }
      });
    });
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function _runbookHtml(id, env) {
  const rb = RUNBOOKS.find(r => r.id === id);
  if (!rb) return errorResponse(`Runbook not found: ${id}`, 404);
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${rb.title} — BrainSAIT Runbook</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:800px;margin:auto}h1{color:#38bdf8}p{color:#94a3b8;margin-top:1rem}</style></head>
<body><a href="/">&larr; Control Tower</a><h1>${rb.title}</h1><p><strong>Owner:</strong> ${rb.owner}</p><p>Runbook steps are managed in the BrainSAIT knowledge base.</p></body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
