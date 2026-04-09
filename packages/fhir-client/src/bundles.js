/**
 * FHIR R4 Bundle Builders for NPHIES transactions
 * Used by oracle-setup, brainsait-rcm, and brainsait-mcp-dxt
 */

import { NPHIES_PROFILES } from './constants.js';

/**
 * Build a FHIR transaction Bundle for claim submission to NPHIES
 * @param {object} params
 * @param {object} params.claim - FHIR Claim resource
 * @param {object} params.patient - FHIR Patient resource
 * @param {object} params.practitioner - FHIR Practitioner resource
 * @param {object} params.organization - FHIR Organization resource (provider)
 * @param {object} params.coverage - FHIR Coverage resource
 * @returns {object} FHIR Bundle
 */
export function buildClaimBundle({ claim, patient, practitioner, organization, coverage }) {
  return {
    resourceType: 'Bundle',
    id: `claim-bundle-${Date.now()}`,
    meta: { profile: [NPHIES_PROFILES.CLAIM_BUNDLE] },
    type: 'transaction',
    timestamp: new Date().toISOString(),
    entry: [
      _entry(`Claim/${claim.id}`, claim, 'POST', 'Claim'),
      _entry(`Patient/${patient.id}`, patient, 'PUT', `Patient/${patient.id}`),
      _entry(`Practitioner/${practitioner.id}`, practitioner, 'PUT', `Practitioner/${practitioner.id}`),
      _entry(`Organization/${organization.id}`, organization, 'PUT', `Organization/${organization.id}`),
      _entry(`Coverage/${coverage.id}`, coverage, 'PUT', `Coverage/${coverage.id}`),
    ].filter(Boolean),
  };
}

/**
 * Build an EligibilityRequest Bundle for NPHIES eligibility check
 */
export function buildEligibilityBundle({ eligibilityRequest, patient, coverage, insurer, provider }) {
  return {
    resourceType: 'Bundle',
    id: `eligibility-bundle-${Date.now()}`,
    meta: { profile: [NPHIES_PROFILES.ELIGIBILITY_BUNDLE] },
    type: 'transaction',
    timestamp: new Date().toISOString(),
    entry: [
      _entry(`CoverageEligibilityRequest/${eligibilityRequest.id}`, eligibilityRequest, 'POST', 'CoverageEligibilityRequest'),
      _entry(`Patient/${patient.id}`, patient, 'PUT', `Patient/${patient.id}`),
      _entry(`Coverage/${coverage.id}`, coverage, 'PUT', `Coverage/${coverage.id}`),
      insurer ? _entry(`Organization/${insurer.id}`, insurer, 'PUT', `Organization/${insurer.id}`) : null,
      provider ? _entry(`Organization/${provider.id}`, provider, 'PUT', `Organization/${provider.id}`) : null,
    ].filter(Boolean),
  };
}

/**
 * Build a Prior Authorization Bundle for NPHIES
 */
export function buildPreAuthBundle({ claim, patient, practitioner, organization, coverage }) {
  const preAuthClaim = { ...claim, use: 'preauthorization' };
  return buildClaimBundle({ claim: preAuthClaim, patient, practitioner, organization, coverage });
}

function _entry(fullUrl, resource, method, url) {
  return {
    fullUrl: `urn:uuid:${fullUrl}`,
    resource,
    request: { method, url },
  };
}
