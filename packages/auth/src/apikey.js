/**
 * API Key verification — for worker-to-worker calls (oracle-setup pattern)
 * Compares in constant time to prevent timing attacks.
 */

/**
 * Verify an API key from the request.
 * Checks X-API-Key header, then Authorization: Bearer, then ?key= query param.
 *
 * @param {Request} request
 * @param {string} expectedKey - value of API_KEY secret
 * @returns {boolean}
 */
export function verifyApiKey(request, expectedKey) {
  if (!expectedKey) return false;

  const candidates = [
    request.headers.get?.('X-API-Key'),
    (() => {
      const auth = request.headers.get?.('Authorization') ?? '';
      return auth.startsWith('Bearer ') ? auth.slice(7) : null;
    })(),
    new URL(request.url).searchParams.get('key'),
  ].filter(Boolean);

  return candidates.some(k => _constantTimeEqual(k, expectedKey));
}

/** Constant-time string comparison (prevents timing attacks) */
function _constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
