/**
 * FHIR R4 / NPHIES constants used across the BrainSAIT platform
 */

export const FHIR_RESOURCE_TYPES = Object.freeze({
  CLAIM: 'Claim',
  CLAIM_RESPONSE: 'ClaimResponse',
  PATIENT: 'Patient',
  PRACTITIONER: 'Practitioner',
  ORGANIZATION: 'Organization',
  COVERAGE: 'Coverage',
  BUNDLE: 'Bundle',
  ELIGIBILITY_REQUEST: 'CoverageEligibilityRequest',
  ELIGIBILITY_RESPONSE: 'CoverageEligibilityResponse',
});

export const NPHIES_PROFILES = Object.freeze({
  CLAIM_BUNDLE: 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/bundle|1.0.0',
  ELIGIBILITY_BUNDLE: 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/eligibility-bundle|1.0.0',
  CLAIM: 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/institutional-claim|1.0.0',
  PATIENT: 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/patient|1.0.0',
  PRACTITIONER: 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/practitioner|1.0.0',
  ORGANIZATION: 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/provider-organization|1.0.0',
  COVERAGE: 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/coverage|1.0.0',
});

export const ICD10_SYSTEMS = Object.freeze({
  ICD10_AM: 'http://hl7.org/fhir/sid/icd-10',
  ICD10_CM: 'http://hl7.org/fhir/sid/icd-10-cm',
  SNOMED: 'http://snomed.info/sct',
});

export const CPT_SYSTEMS = Object.freeze({
  CPT: 'http://www.ama-assn.org/go/cpt',
  HCPCS: 'https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets',
  SBS: 'http://nphies.sa/terminology/CodeSystem/sbs',
});

export const CLAIM_STATUS = Object.freeze({
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  DRAFT: 'draft',
  ENTERED_IN_ERROR: 'entered-in-error',
});

export const CLAIM_USE = Object.freeze({
  CLAIM: 'claim',
  PREAUTHORIZATION: 'preauthorization',
  PREDETERMINATION: 'predetermination',
});

/** Saudi Arabia NPHIES endpoint */
export const NPHIES_BASE_URL = 'https://nphies.sa/license/';

/** Standard BrainSAIT FHIR server */
export const BRAINSAIT_FHIR_URL = 'https://fhir.brainsait.io/r4';
