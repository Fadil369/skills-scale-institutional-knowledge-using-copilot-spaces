/**
 * Role-Based Access Control (RBAC)
 * Healthcare roles aligned with brainsait-rcm model.
 */

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  ANALYST: 'analyst',
  CLINICIAN: 'clinician',
  READONLY: 'readonly',
});

const ROLE_HIERARCHY = {
  admin: 4,
  manager: 3,
  analyst: 2,
  clinician: 2,
  readonly: 1,
};

/**
 * Check if a role has at least the required access level.
 * @param {string} userRole - role from JWT payload
 * @param {string} requiredRole - minimum role required
 * @returns {boolean}
 */
export function hasRole(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 99;
  return userLevel >= requiredLevel;
}
