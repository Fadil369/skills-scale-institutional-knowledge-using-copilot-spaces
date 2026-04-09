/**
 * JWT utilities (HMAC-SHA256) — works in CF Workers and Node.js 20+
 * Ported from workers/shared/auth.ts and normalized for JS module format.
 */

/**
 * Verify a Bearer JWT.
 * @param {string} token
 * @param {string} secret - JWT_SECRET environment variable
 * @returns {Promise<object|null>} decoded payload or null if invalid/expired
 */
export async function verifyJwt(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const encoder = new TextEncoder();

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = _b64urlDecode(signatureB64);

    const valid = await crypto.subtle.verify('HMAC', cryptoKey, signature, data);
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Sign a JWT payload.
 * @param {object} payload - must include sub and role; iat/exp added automatically
 * @param {string} secret
 * @param {number} [expiresInSeconds=3600]
 * @returns {Promise<string>} signed JWT
 */
export async function signJwt(payload, secret, expiresInSeconds = 3600) {
  const header = _b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = _b64urlEncode(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }));
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${header}.${body}`));
  const sig = _b64urlEncodeBuffer(sigBuf);

  return `${header}.${body}.${sig}`;
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(request) {
  const auth = request.headers.get?.('Authorization') ?? request.headers?.['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function _b64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _b64urlEncodeBuffer(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _b64urlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
