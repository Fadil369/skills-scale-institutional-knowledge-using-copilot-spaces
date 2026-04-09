/**
 * FHIR R4 Resource Validator
 * Validates resource structure against NPHIES profiles and HL7 FHIR R4 base spec
 */

/** Required fields per resource type */
const REQUIRED_FIELDS = {
  Claim: ['status', 'type', 'use', 'patient', 'created', 'insurer', 'provider', 'priority', 'insurance', 'item'],
  ClaimResponse: ['status', 'type', 'use', 'patient', 'created', 'insurer', 'request', 'outcome'],
  Patient: ['id', 'name', 'gender'],
  Practitioner: ['id', 'name'],
  Organization: ['id', 'name'],
  Coverage: ['status', 'beneficiary', 'payor'],
  EligibilityRequest: ['status', 'purpose', 'patient', 'created', 'insurer', 'provider'],
};

/** Valid FHIR resource types in use across the BrainSAIT platform */
export const VALID_RESOURCE_TYPES = new Set([
  'Claim', 'ClaimResponse', 'Patient', 'Practitioner', 'Organization',
  'Coverage', 'EligibilityRequest', 'EligibilityResponse',
  'Bundle', 'OperationOutcome', 'Parameters',
]);

/**
 * Validate a single FHIR resource.
 * @param {object} resource - The FHIR resource object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateResource(resource) {
  const errors = [];

  if (!resource || typeof resource !== 'object') {
    return { valid: false, errors: ['Resource must be a non-null object'] };
  }

  if (!resource.resourceType) {
    errors.push('Missing required field: resourceType');
  } else if (!VALID_RESOURCE_TYPES.has(resource.resourceType)) {
    errors.push(`Unknown resourceType: ${resource.resourceType}`);
  }

  const required = REQUIRED_FIELDS[resource.resourceType] ?? [];
  for (const field of required) {
    if (resource[field] === undefined || resource[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate NPHIES-specific extensions for Claims
  if (resource.resourceType === 'Claim') {
    errors.push(...validateNphiesClaim(resource));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a FHIR Bundle (transaction or collection).
 * @param {object} bundle - FHIR Bundle resource
 * @returns {{ valid: boolean, errors: string[], resourceErrors: object[] }}
 */
export function validateBundle(bundle) {
  const result = validateResource(bundle);
  const resourceErrors = [];

  if (bundle.resourceType === 'Bundle' && Array.isArray(bundle.entry)) {
    bundle.entry.forEach((entry, i) => {
      if (entry.resource) {
        const r = validateResource(entry.resource);
        if (!r.valid) {
          resourceErrors.push({ index: i, resourceType: entry.resource.resourceType, errors: r.errors });
          result.errors.push(`Entry[${i}] (${entry.resource.resourceType}): ${r.errors.join('; ')}`);
        }
      }
    });
  }

  return { valid: result.errors.length === 0, errors: result.errors, resourceErrors };
}

/** NPHIES-specific claim validation rules */
function validateNphiesClaim(claim) {
  const errors = [];

  // NPHIES requires Saudi National ID or Iqama for patients
  if (!claim.patient?.identifier) {
    errors.push('NPHIES: Claim.patient must include identifier (NationalID or Iqama)');
  }

  // NPHIES requires claim.use to be 'claim', 'preauthorization', or 'predetermination'
  const validUse = ['claim', 'preauthorization', 'predetermination'];
  if (claim.use && !validUse.includes(claim.use)) {
    errors.push(`NPHIES: Claim.use must be one of: ${validUse.join(', ')}`);
  }

  // Each item must have productOrService coding
  if (Array.isArray(claim.item)) {
    claim.item.forEach((item, i) => {
      if (!item.productOrService?.coding?.length) {
        errors.push(`NPHIES: Claim.item[${i}].productOrService must include a coding`);
      }
    });
  }

  return errors;
}
