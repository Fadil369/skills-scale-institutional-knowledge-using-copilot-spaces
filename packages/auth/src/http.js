/**
 * HTTP helpers — CORS, JSON responses
 * Consolidates helpers from workers/shared/auth.ts and brainsait-rcm FastAPI middleware.
 */

const ALLOWED_ORIGINS = [
  'https://fadil369.github.io',
  'https://brainsait.io',
  'https://portals.elfadil.com',
  'http://localhost:3000',
  'http://localhost:5173',
];

export function corsHeaders(origin) {
  const responseOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': responseOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Max-Age': '86400',
  };
}

export function jsonResponse(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export function errorResponse(message, status, origin) {
  return jsonResponse({ error: message }, status, origin);
}
