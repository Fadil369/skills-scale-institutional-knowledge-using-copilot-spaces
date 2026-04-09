/**
 * @brainsait/auth
 * Unified authentication for BrainSAIT workers and apps.
 *
 * Strategy:
 *  - JWT (HMAC-SHA256) for user-facing apps and API consumers  (brainsait-rcm pattern)
 *  - API key (X-API-Key header) for worker-to-worker calls     (oracle-setup pattern)
 *
 * Works in both Cloudflare Workers runtime and Node.js.
 */

export { verifyJwt, signJwt, extractBearerToken } from './jwt.js';
export { verifyApiKey } from './apikey.js';
export { corsHeaders, errorResponse, jsonResponse } from './http.js';
export { ROLES, hasRole } from './roles.js';
