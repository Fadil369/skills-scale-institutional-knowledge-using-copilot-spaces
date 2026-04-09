/**
 * brainsait-mcp-gateway — Cloudflare Worker
 * Adapted from Fadil369/brainsait-mcp-dxt for deployment as a CF Worker.
 *
 * Exposes 14 HIPAA/NPHIES-compliant healthcare MCP tools via HTTP.
 * Routes: mcp.brainsait.io/*  (also accessible via api-gateway /api/mcp/*)
 * Bindings: AUDIT_DB (D1), MCP_SESSIONS (KV), PHI_DOCS (R2)
 * Authentication: JWT Bearer for users, X-API-Key for workers
 */

import { verifyJwt, verifyApiKey, extractBearerToken, corsHeaders, errorResponse, jsonResponse } from '../../packages/auth/src/index.js';
import { FhirClient, validateResource, validateBundle } from '../../packages/fhir-client/src/index.js';
import { t } from '../../packages/i18n/src/index.js';

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin');
    const path   = url.pathname.replace(/^\/api\/mcp/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (path === '/health') {
      return jsonResponse({ status: 'ok', worker: 'brainsait-mcp-gateway', tools: MCP_TOOLS.length }, 200, origin);
    }

    const authenticated = await _authenticate(request, env);
    if (!authenticated) return errorResponse('Unauthorized', 401, origin);

    if (path === '/tools' && request.method === 'GET') {
      return jsonResponse({
        tools: MCP_TOOLS.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }))
      }, 200, origin);
    }

    if (path === '/call' && request.method === 'POST') {
      return _callTool(request, env, authenticated, origin);
    }

    return errorResponse('Not found', 404, origin);
  },
};

async function _authenticate(request, env) {
  if (verifyApiKey(request, env.API_KEY)) {
    return { type: 'apikey', sub: 'service', role: 'admin' };
  }
  const token = extractBearerToken(request);
  if (token) {
    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (payload) return { type: 'jwt', ...payload };
  }
  return null;
}

async function _callTool(request, env, auth, origin) {
  const body = await request.json().catch(() => null);
  if (!body || !body.name) return errorResponse('Missing tool name', 400, origin);

  const tool = MCP_TOOLS.find(tool => tool.name === body.name);
  if (!tool) return errorResponse('Unknown tool: ' + body.name, 404, origin);

  const inputs = body.arguments ?? body.input ?? {};
  const locale = inputs.language ?? env.DEFAULT_LANGUAGE ?? 'en';

  try {
    await _auditLog(env, auth, body.name, inputs);
    const result = await tool.handler(inputs, env, locale);
    return jsonResponse({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }, 200, origin);
  } catch (err) {
    return errorResponse(err.message, 500, origin);
  }
}

async function _auditLog(env, auth, toolName, inputs) {
  if (!env.AUDIT_DB) return;
  const sanitized = _sanitizePhi(inputs);
  await env.AUDIT_DB.prepare(
    'INSERT INTO audit_log (ts, user_id, tool, inputs_hash, compliance) VALUES (?, ?, ?, ?, ?)'
  ).bind(Date.now(), auth.sub, toolName, _hash(JSON.stringify(sanitized)), 'HIPAA').run();
}

function _sanitizePhi(inputs) {
  const phi = ['patientId', 'nid', 'iqama', 'dob', 'name', 'phone', 'email'];
  const out = { ...inputs };
  for (const k of phi) { if (out[k]) out[k] = '[REDACTED]'; }
  return out;
}

function _hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
  return h.toString(16);
}

async function _encrypt(data, key) {
  const enc = new TextEncoder();
  const keyBuf = enc.encode(key.padEnd(32, '0').slice(0, 32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(data));
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function _decrypt(b64data, key) {
  const enc = new TextEncoder();
  const keyBuf = enc.encode(key.padEnd(32, '0').slice(0, 32));
  const buf = Uint8Array.from(atob(b64data), c => c.charCodeAt(0));
  const iv = buf.slice(0, 12);
  const data = buf.slice(12);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
  return new TextDecoder().decode(plain);
}

/** 14 MCP Tools */
const MCP_TOOLS = [
  {
    name: 'validate_fhir_resource',
    description: 'Validate a FHIR R4 resource against NPHIES profiles',
    inputSchema: { type: 'object', properties: { resource: { type: 'object' } }, required: ['resource'] },
    async handler({ resource }, env, locale) {
      const result = validateResource(resource);
      return {
        valid: result.valid,
        errors: result.errors,
        message: result.valid ? t('compliance.compliant', locale) : t('compliance.nonCompliant', locale),
      };
    },
  },
  {
    name: 'validate_fhir_bundle',
    description: 'Validate a FHIR R4 Bundle',
    inputSchema: { type: 'object', properties: { bundle: { type: 'object' } }, required: ['bundle'] },
    async handler({ bundle }) { return validateBundle(bundle); },
  },
  {
    name: 'clinical_terminology_lookup',
    description: 'Look up ICD-10, CPT, LOINC, or SBS codes',
    inputSchema: { type: 'object', properties: { code: { type: 'string' }, system: { type: 'string' } }, required: ['code'] },
    async handler({ code, system = 'ICD-10', language = 'en' }, env) {
      const fhir = new FhirClient({ baseUrl: env.FHIR_BASE_URL, apiKey: env.API_KEY, language });
      return fhir.search('CodeSystem', { code, system }).catch(() => ({ code, system, display: 'Lookup unavailable' }));
    },
  },
  {
    name: 'audit_log_query',
    description: 'Query HIPAA compliance audit logs',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' }, tool: { type: 'string' } } },
    async handler({ limit = 20, tool }, env) {
      if (!env.AUDIT_DB) return { error: 'Audit DB not configured' };
      const q = tool
        ? env.AUDIT_DB.prepare('SELECT * FROM audit_log WHERE tool = ? ORDER BY ts DESC LIMIT ?').bind(tool, limit)
        : env.AUDIT_DB.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?').bind(limit);
      const { results } = await q.all();
      return { count: results.length, records: results };
    },
  },
  {
    name: 'nphies_interoperability_check',
    description: 'Validate against Saudi NPHIES interoperability standards',
    inputSchema: { type: 'object', properties: { resource: { type: 'object' } }, required: ['resource'] },
    async handler({ resource }) {
      const result = validateResource(resource);
      const nphiesErrors = result.errors.filter(e => e.startsWith('NPHIES:'));
      return { compliant: nphiesErrors.length === 0, nphiesErrors, allErrors: result.errors };
    },
  },
  {
    name: 'clinical_decision_support',
    description: 'AI-assisted clinical guidance for diagnosis/procedure codes',
    inputSchema: { type: 'object', properties: { diagnosisCode: { type: 'string' }, language: { type: 'string' } }, required: ['diagnosisCode'] },
    async handler({ diagnosisCode, language = 'en' }) {
      return { diagnosisCode, language, guidance: 'Configure FHIR CDS Hooks to enable AI guidance.' };
    },
  },
  {
    name: 'bilingual_content_translate',
    description: 'Translate medical content between Arabic and English',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, targetLocale: { type: 'string' } }, required: ['key'] },
    async handler({ key, targetLocale = 'ar', vars = {} }) {
      return { key, locale: targetLocale, text: t(key, targetLocale, vars) };
    },
  },
  {
    name: 'phi_encryption_handler',
    description: 'Encrypt or decrypt Protected Health Information (PHI) using AES-256-GCM',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['encrypt', 'decrypt'] }, data: { type: 'string' } }, required: ['action', 'data'] },
    async handler({ action, data }, env) {
      if (!env.ENCRYPTION_KEY) return { error: 'ENCRYPTION_KEY not configured' };
      if (action === 'encrypt') return { encrypted: await _encrypt(data, env.ENCRYPTION_KEY) };
      return { decrypted: await _decrypt(data, env.ENCRYPTION_KEY) };
    },
  },
  {
    name: 'role_based_access_control',
    description: 'Check user role permissions for healthcare operations',
    inputSchema: { type: 'object', properties: { userRole: { type: 'string' }, requiredRole: { type: 'string' }, resource: { type: 'string' } }, required: ['userRole', 'requiredRole'] },
    async handler({ userRole, requiredRole, resource = '*' }) {
      const hierarchy = { admin: 4, manager: 3, analyst: 2, clinician: 2, readonly: 1 };
      const allowed = (hierarchy[userRole] ?? 0) >= (hierarchy[requiredRole] ?? 99);
      return { userRole, requiredRole, resource, allowed };
    },
  },
  {
    name: 'web_connector_register',
    description: 'Register a remote healthcare system connector (EHR, FHIR, Audit)',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string' }, url: { type: 'string' } }, required: ['id', 'type', 'url'] },
    async handler({ id, type, url }, env) {
      if (!env.MCP_SESSIONS) return { error: 'MCP_SESSIONS KV not configured' };
      await env.MCP_SESSIONS.put('connector:' + id, JSON.stringify({ id, type, url, registeredAt: Date.now() }));
      return { registered: true, id, type, url };
    },
  },
  {
    name: 'web_connector_execute',
    description: 'Execute an operation on a registered remote healthcare system',
    inputSchema: { type: 'object', properties: { connectorId: { type: 'string' }, operation: { type: 'string' }, payload: { type: 'object' } }, required: ['connectorId', 'operation'] },
    async handler({ connectorId, operation, payload = {} }, env) {
      if (!env.MCP_SESSIONS) return { error: 'MCP_SESSIONS KV not configured' };
      const conn = await env.MCP_SESSIONS.get('connector:' + connectorId, { type: 'json' });
      if (!conn) return { error: 'Connector not found: ' + connectorId };
      const res = await fetch(conn.url + '/' + operation, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(e => ({ json: async () => ({ error: e.message }) }));
      return { connectorId, operation, result: await res.json() };
    },
  },
  {
    name: 'web_connector_list',
    description: 'List all registered healthcare system connectors',
    inputSchema: { type: 'object', properties: {} },
    async handler(_, env) {
      if (!env.MCP_SESSIONS) return { connectors: [] };
      const { keys } = await env.MCP_SESSIONS.list({ prefix: 'connector:' });
      const connectors = await Promise.all(keys.map(k => env.MCP_SESSIONS.get(k.name, { type: 'json' })));
      return { connectors: connectors.filter(Boolean) };
    },
  },
  {
    name: 'web_connector_status',
    description: 'Get health status of a registered connector',
    inputSchema: { type: 'object', properties: { connectorId: { type: 'string' } }, required: ['connectorId'] },
    async handler({ connectorId }, env) {
      if (!env.MCP_SESSIONS) return { error: 'MCP_SESSIONS KV not configured' };
      const conn = await env.MCP_SESSIONS.get('connector:' + connectorId, { type: 'json' });
      if (!conn) return { error: 'Connector not found' };
      const res = await fetch(conn.url + '/health').catch(e => ({ ok: false, status: -1, statusText: e.message }));
      return { connectorId, url: conn.url, status: res.ok ? 'healthy' : 'unhealthy', httpStatus: res.status };
    },
  },
  {
    name: 'web_connector_unregister',
    description: 'Remove a registered connector',
    inputSchema: { type: 'object', properties: { connectorId: { type: 'string' } }, required: ['connectorId'] },
    async handler({ connectorId }, env) {
      if (!env.MCP_SESSIONS) return { error: 'MCP_SESSIONS KV not configured' };
      await env.MCP_SESSIONS.delete('connector:' + connectorId);
      return { unregistered: true, connectorId };
    },
  },
];
