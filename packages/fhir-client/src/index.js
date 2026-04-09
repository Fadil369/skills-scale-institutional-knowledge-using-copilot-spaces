/**
 * @brainsait/fhir-client
 * Unified FHIR R4 client — shared across oracle-setup, brainsait-rcm, and brainsait-mcp-dxt
 *
 * Consolidates three separate FHIR implementations into one canonical library.
 */

export { FhirClient } from './client.js';
export { validateResource, validateBundle } from './validator.js';
export { buildClaimBundle, buildEligibilityBundle, buildPreAuthBundle } from './bundles.js';
export { FHIR_RESOURCE_TYPES, NPHIES_PROFILES, ICD10_SYSTEMS, CPT_SYSTEMS } from './constants.js';
