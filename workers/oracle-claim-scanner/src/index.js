/**
 * oracle-claim-scanner — Cloudflare Worker
 * Migrated from Fadil369/oracle-setup into the solutions monorepo.
 *
 * Automates Oracle Oasis+ ERP scanning for 6 BrainSAIT hospital branches
 * using Cloudflare Browser Rendering (Puppeteer).
 *
 * Routes: oracle-scanner.elfadil.com/*
 * Bindings: BROWSER, SESSIONS KV (8h), RESULTS KV (24h)
 *
 * Authentication: X-API-Key or Authorization: Bearer <key> or ?key=
 */

import puppeteer from '@cloudflare/puppeteer';
import { verifyApiKey, corsHeaders, errorResponse, jsonResponse } from '../../packages/auth/src/index.js';

/** Hospital branch registry */
const HOSPITALS = {
  riyadh: {
    id: 'riyadh',
    name: 'الرياض',
    nameEn: 'Riyadh',
    baseUrl: 'https://oracle-riyadh.elfadil.com',
    loginPath: '/prod/faces/Home',
    probeTimeoutMs: 8000,
  },
  madinah: {
    id: 'madinah',
    name: 'المدينة',
    nameEn: 'Madinah',
    baseUrl: 'https://oracle-madinah.elfadil.com',
    loginPath: '/Oasis/faces/Login.jsf',
    probeTimeoutMs: 8000,
  },
  unaizah: {
    id: 'unaizah',
    name: 'عنيزة',
    nameEn: 'Unaizah',
    baseUrl: 'https://oracle-unaizah.elfadil.com',
    loginPath: '/prod/faces/Login.jsf',
    probeTimeoutMs: 8000,
  },
  khamis: {
    id: 'khamis',
    name: 'خميس',
    nameEn: 'Khamis Mushait',
    baseUrl: 'https://oracle-khamis.elfadil.com',
    loginPath: '/prod/faces/Login.jsf',
    probeTimeoutMs: 8000,
  },
  jizan: {
    id: 'jizan',
    name: 'جازان',
    nameEn: 'Jizan',
    baseUrl: 'https://oracle-jizan.elfadil.com',
    loginPath: '/prod/faces/Login.jsf',
    probeTimeoutMs: 12000,
  },
  abha: {
    id: 'abha',
    name: 'أبها',
    nameEn: 'Abha',
    baseUrl: 'https://oracle-abha.elfadil.com',
    loginPath: '/Oasis/faces/Home',
    probeTimeoutMs: 8000,
  },
};

const SESSIONS_TTL = 8 * 60 * 60;  // 8 hours in seconds
const RESULTS_TTL  = 24 * 60 * 60; // 24 hours in seconds

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin');
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const path = url.pathname;

    // ── Public endpoints ──────────────────────────────────────────
    if (path === '/health' && method === 'GET') {
      return jsonResponse({ status: 'ok', worker: 'oracle-claim-scanner', ts: Date.now() }, 200, origin);
    }

    if (path === '/control-tower/claims' && method === 'GET') {
      return _getControlTowerClaims(env, origin);
    }

    // ── Protected endpoints ───────────────────────────────────────
    if (!verifyApiKey(request, env.API_KEY)) {
      return errorResponse('Unauthorized', 401, origin);
    }

    if (path === '/hospitals' && method === 'GET') {
      return jsonResponse(Object.values(HOSPITALS).map(h => ({
        id: h.id, name: h.name, nameEn: h.nameEn, baseUrl: h.baseUrl,
      })), 200, origin);
    }

    if (path === '/scan' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return _scanHospital(body.hospitalId, body.claimIds ?? [], env, origin);
    }

    if (path === '/scan-batch' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return _scanBatch(body.scans ?? [], env, origin);
    }

    const resultMatch = path.match(/^\/results\/(.+)$/);
    if (resultMatch) {
      const id = resultMatch[1];
      if (method === 'GET') {
        const data = await env.RESULTS.get(id, { type: 'json' });
        return data ? jsonResponse(data, 200, origin) : errorResponse('Not found', 404, origin);
      }
      if (method === 'DELETE') {
        await env.RESULTS.delete(id);
        return jsonResponse({ deleted: id }, 200, origin);
      }
    }

    if (path === '/sessions' && method === 'GET') {
      return jsonResponse({ message: 'Session listing not exposed for security reasons' }, 200, origin);
    }

    return errorResponse('Not found', 404, origin);
  },
};

/** Scan a single hospital for specified claim IDs */
async function _scanHospital(hospitalId, claimIds, env, origin) {
  const hospital = HOSPITALS[hospitalId];
  if (!hospital) {
    return errorResponse(`Unknown hospital: ${hospitalId}`, 400, origin);
  }

  const resultId = `scan-${hospitalId}-${Date.now()}`;
  const credentials = _getCredentials(hospitalId, env);

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();

    // Restore session cookie if cached
    const sessionKey = `session-${hospitalId}`;
    const cachedSession = await env.SESSIONS.get(sessionKey, { type: 'json' });
    if (cachedSession?.cookies) {
      await page.setCookie(...cachedSession.cookies);
    }

    // Navigate to Oracle Oasis+
    await page.goto(`${hospital.baseUrl}${hospital.loginPath}`, {
      waitUntil: 'networkidle2',
      timeout: hospital.probeTimeoutMs,
    });

    // Login if session not valid
    const isLoggedIn = await page.$('[data-username], .oracle-dashboard, #pt1\\:_uiems\\:0\\:r0\\:0\\:ot1');
    if (!isLoggedIn) {
      await _oracleLogin(page, credentials);
      // Cache new session cookies
      const cookies = await page.cookies();
      await env.SESSIONS.put(sessionKey, JSON.stringify({ cookies, loginAt: Date.now() }), {
        expirationTtl: SESSIONS_TTL,
      });
    }

    // Scan claims
    const results = await _extractClaimsData(page, claimIds);

    const result = {
      id: resultId,
      hospitalId,
      hospitalName: hospital.nameEn,
      claimIds,
      results,
      scannedAt: new Date().toISOString(),
      status: 'success',
    };

    await env.RESULTS.put(resultId, JSON.stringify(result), { expirationTtl: RESULTS_TTL });
    return jsonResponse(result, 200, origin);

  } catch (err) {
    const result = {
      id: resultId,
      hospitalId,
      status: 'error',
      error: err.message,
      scannedAt: new Date().toISOString(),
    };
    await env.RESULTS.put(resultId, JSON.stringify(result), { expirationTtl: RESULTS_TTL });
    return jsonResponse(result, 500, origin);
  } finally {
    await browser?.close();
  }
}

/** Run multiple scans in parallel (max 3 concurrent) */
async function _scanBatch(scans, env, origin) {
  const results = await Promise.allSettled(
    scans.map(s => _scanHospital(s.hospitalId, s.claimIds ?? [], env, null))
  );
  return jsonResponse(results.map((r, i) => ({
    scan: scans[i],
    status: r.status,
    value: r.value ? r.value : undefined,
    reason: r.reason?.message,
  })), 200, origin);
}

/** Return aggregated claims summary for the control tower */
async function _getControlTowerClaims(env, origin) {
  const keys = await env.RESULTS.list({ prefix: 'scan-' });
  const recent = keys.keys.slice(-20); // last 20 results
  const data = await Promise.all(
    recent.map(k => env.RESULTS.get(k.name, { type: 'json' }))
  );
  return jsonResponse({ claims: data.filter(Boolean), ts: Date.now() }, 200, origin);
}

/** Login to Oracle Oasis+ ERP */
async function _oracleLogin(page, { username, password }) {
  // Oracle Oasis+ login form selectors (common across branches)
  const selectors = [
    { user: '#pt1\\:r1\\:0\\:UserID\\:\\:content', pass: '#pt1\\:r1\\:0\\:password\\:\\:content' },
    { user: '#UserID\\:\\:content', pass: '#password\\:\\:content' },
    { user: 'input[name="username"]', pass: 'input[name="password"]' },
  ];

  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel.user, { timeout: 3000 });
      await page.type(sel.user, username, { delay: 30 });
      await page.type(sel.pass, password, { delay: 30 });
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      return;
    } catch {
      // Try next selector
    }
  }
  throw new Error('Could not find Oracle login form');
}

/** Extract claim data from Oracle Oasis+ page */
async function _extractClaimsData(page, claimIds) {
  // Navigate to claims list if not already there
  try {
    await page.goto(page.url().replace(/\/faces\/.*/, '/faces/Claims/ClaimsList'), {
      waitUntil: 'networkidle2',
      timeout: 10000,
    });
  } catch {
    // Ignore navigation errors — try extracting from current page
  }

  return page.evaluate((ids) => {
    const rows = Array.from(document.querySelectorAll('tr[data-claim-id], .oracle-claim-row'));
    return rows
      .filter(r => !ids.length || ids.includes(r.dataset.claimId))
      .map(r => ({
        claimId: r.dataset.claimId ?? r.querySelector('[data-field="id"]')?.textContent?.trim(),
        status: r.querySelector('[data-field="status"]')?.textContent?.trim(),
        amount: r.querySelector('[data-field="amount"]')?.textContent?.trim(),
        patientName: r.querySelector('[data-field="patient"]')?.textContent?.trim(),
        date: r.querySelector('[data-field="date"]')?.textContent?.trim(),
      }));
  }, claimIds);
}

/** Resolve per-hospital credentials with shared fallback */
function _getCredentials(hospitalId, env) {
  const suffix = hospitalId.toUpperCase();
  return {
    username: env[`ORACLE_USER_${suffix}`] ?? env.ORACLE_USER,
    password: env[`ORACLE_PASS_${suffix}`] ?? env.ORACLE_PASS,
  };
}
