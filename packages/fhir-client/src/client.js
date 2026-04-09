/**
 * FhirClient — HTTP client for FHIR R4 servers
 * Supports NPHIES endpoints, BrainSAIT FHIR gateway, and standard FHIR servers
 */
export class FhirClient {
  /**
   * @param {object} config
   * @param {string} config.baseUrl - FHIR server base URL (e.g. https://fhir.brainsait.io/r4)
   * @param {string} [config.accessToken] - Bearer token for authenticated requests
   * @param {string} [config.apiKey] - API key header alternative
   * @param {string} [config.language='en'] - Preferred language ('ar' | 'en')
   */
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.accessToken = config.accessToken;
    this.apiKey = config.apiKey;
    this.language = config.language ?? 'en';
  }

  /** Build standard headers for all requests */
  _headers(extra = {}) {
    const h = {
      'Content-Type': 'application/fhir+json',
      Accept: 'application/fhir+json',
      'Accept-Language': this.language === 'ar' ? 'ar,en' : 'en,ar',
      ...extra,
    };
    if (this.accessToken) h['Authorization'] = `Bearer ${this.accessToken}`;
    if (this.apiKey) h['X-API-Key'] = this.apiKey;
    return h;
  }

  /** GET a FHIR resource by type and ID */
  async read(resourceType, id) {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new FhirError(res.status, await res.text());
    return res.json();
  }

  /** Search for resources */
  async search(resourceType, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}/${resourceType}${qs ? '?' + qs : ''}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new FhirError(res.status, await res.text());
    return res.json();
  }

  /** POST a new resource or transaction bundle */
  async create(resourceType, resource) {
    const url = resourceType === 'Bundle'
      ? this.baseUrl  // transaction POST to base URL
      : `${this.baseUrl}/${resourceType}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(resource),
    });
    if (!res.ok) throw new FhirError(res.status, await res.text());
    return res.json();
  }

  /** PUT to update a resource */
  async update(resourceType, id, resource) {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(resource),
    });
    if (!res.ok) throw new FhirError(res.status, await res.text());
    return res.json();
  }

  /** Submit a claim to NPHIES */
  async submitClaim(claimBundle) {
    return this.create('Bundle', claimBundle);
  }

  /** Check patient eligibility */
  async checkEligibility(eligibilityBundle) {
    return this.create('Bundle', eligibilityBundle);
  }

  /** Submit a prior authorization request */
  async submitPreAuth(preAuthBundle) {
    return this.create('Bundle', preAuthBundle);
  }

  /** Poll for claim response */
  async getClaimResponse(claimId) {
    return this.read('ClaimResponse', claimId);
  }
}

export class FhirError extends Error {
  constructor(status, body) {
    super(`FHIR request failed: HTTP ${status}`);
    this.status = status;
    this.body = body;
    this.name = 'FhirError';
  }
}
