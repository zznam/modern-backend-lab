/**
 * Authorization Models: RBAC (Role-Based) vs ABAC (Attribute-Based Access Control)
 */

// ==========================================
// 1. RBAC (Role-Based Access Control)
// ==========================================
export type Role = 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER';
export type Permission =
  | 'orders:read'
  | 'orders:create'
  | 'orders:update'
  | 'orders:delete'
  | 'users:manage'
  | 'audit:export';

export const RolePermissionsMap: Record<Role, Permission[]> = {
  ADMIN: ['orders:read', 'orders:create', 'orders:update', 'orders:delete', 'users:manage', 'audit:export'],
  MANAGER: ['orders:read', 'orders:create', 'orders:update', 'audit:export'],
  EDITOR: ['orders:read', 'orders:create', 'orders:update'],
  VIEWER: ['orders:read'],
};

export class RbacEvaluator {
  public static hasPermission(userRole: Role, requiredPermission: Permission): boolean {
    const permissions = RolePermissionsMap[userRole] || [];
    return permissions.includes(requiredPermission);
  }
}

// ==========================================
// 2. ABAC (Attribute-Based Access Control)
// ==========================================
export interface AbacSubject {
  id: string;
  department: string;
  clearanceLevel: number; // 1 to 5
  isContractor: boolean;
}

export interface AbacResource {
  id: string;
  ownerId: string;
  department: string;
  classificationLevel: number; // 1 to 5
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export interface AbacEnvironment {
  currentHourUtc: number; // 0 - 23
  isCorporateVpn: boolean;
  clientIp: string;
}

export type AbacAction = 'READ' | 'WRITE' | 'DELETE' | 'EXPORT_PII';

export interface AbacPolicyRule {
  id: string;
  description: string;
  evaluate: (s: AbacSubject, r: AbacResource, a: AbacAction, e: AbacEnvironment) => { allowed: boolean; reason?: string };
}

export class AbacPolicyEngine {
  private policies: AbacPolicyRule[] = [
    // Rule 1: Classification Check - Subject clearance must be >= Resource classification
    {
      id: 'CLEARANCE_CHECK',
      description: 'Clearance level must meet or exceed document classification level',
      evaluate: (s, r) => {
        if (s.clearanceLevel < r.classificationLevel) {
          return { allowed: false, reason: `Insufficient clearance (${s.clearanceLevel} < required ${r.classificationLevel})` };
        }
        return { allowed: true };
      },
    },

    // Rule 2: Department Boundary or Ownership
    {
      id: 'DEPARTMENT_OR_OWNER',
      description: 'Must belong to the same department or be the explicit owner',
      evaluate: (s, r) => {
        if (s.department !== r.department && s.id !== r.ownerId) {
          return { allowed: false, reason: 'Cross-department access prohibited without explicit document ownership' };
        }
        return { allowed: true };
      },
    },

    // Rule 3: Environmental VPN Requirement for Exports
    {
      id: 'VPN_FOR_EXPORTS',
      description: 'PII / Audit Export only allowed through corporate VPN during business hours',
      evaluate: (s, r, action, env) => {
        if (action === 'EXPORT_PII') {
          if (!env.isCorporateVpn) {
            return { allowed: false, reason: 'PII Export rejected: Client is not on Corporate VPN' };
          }
          if (env.currentHourUtc < 8 || env.currentHourUtc > 18) {
            return { allowed: false, reason: 'PII Export rejected: Outside authorized business hours (08:00 - 18:00 UTC)' };
          }
        }
        return { allowed: true };
      },
    },

    // Rule 4: Contractors cannot delete active or archived assets
    {
      id: 'CONTRACTOR_DELETE_RESTRICTION',
      description: 'External contractors cannot perform destructive operations',
      evaluate: (s, r, action) => {
        if (s.isContractor && (action === 'DELETE' || action === 'EXPORT_PII')) {
          return { allowed: false, reason: 'Action denied: Contractors have non-destructive read/write grants only' };
        }
        return { allowed: true };
      },
    },
  ];

  public authorize(
    subject: AbacSubject,
    resource: AbacResource,
    action: AbacAction,
    env: AbacEnvironment
  ): { decision: 'ALLOW' | 'DENY'; matchedRule?: string; reason?: string } {
    for (const policy of this.policies) {
      const res = policy.evaluate(subject, resource, action, env);
      if (!res.allowed) {
        return { decision: 'DENY', matchedRule: policy.id, reason: res.reason };
      }
    }
    return { decision: 'ALLOW' };
  }
}
