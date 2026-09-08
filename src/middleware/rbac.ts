import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { ApiResponse } from '../utils/apiResponse';

import { RoleType } from '../types/crm.types';
export { RoleType };

export function authorize(allowedRoles: RoleType[] = []) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthenticated request', 401);
    }

    const userRole = req.user.role as RoleType;

    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      return ApiResponse.error(
        res,
        `Access denied. Administrator privileges required.`,
        403
      );
    }

    next();
  };
}

export function requirePermission(actionKey: string, parentFeatureKey?: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthenticated request', 401);
    }

    // Admin automatically has full permissions
    if (req.user.role === 'ADMIN') {
      return next();
    }

    const permissions = req.user.permissions || {};

    // Determine parent feature key if not explicitly provided
    const parent = parentFeatureKey || (actionKey.includes('.') ? actionKey.split('.')[0] : actionKey);

    // LEVEL 1 CHECK: If parent module is disabled
    if (permissions[parent] === false || (parent === actionKey && !permissions[parent])) {
      return ApiResponse.error(
        res,
        `Access denied. Module '${parent}' is not activated for your account. Please contact your CRM Administrator.`,
        403
      );
    }

    // LEVEL 2 CHECK: If a sub-action is specified
    if (actionKey !== parent) {
      const actionPerm = permissions[actionKey];

      // Explicitly disabled
      if (actionPerm === false) {
        return ApiResponse.error(
          res,
          `Access denied. You do not have permission for action '${actionKey}'. Please contact your CRM Administrator.`,
          403
        );
      }

      // If action is undefined in legacy records:
      if (actionPerm === undefined) {
        // High-security administrative/manager actions default to FALSE if not explicitly granted
        const SENSITIVE_ACTIONS = [
          'leave.approve',
          'leave.reject',
          'attendance.approve',
          'attendance.edit',
          'attendance.view_team',
          'leave.view_team',
          'tasks.view_team',
          'tasks.delete',
          'products.create',
          'products.edit',
          'products.delete',
          'leads.delete',
          'payroll.view',
          'payroll.manage',
          'employees.create',
          'employees.edit',
          'employees.status',
          'employees.permissions',
        ];

        if (SENSITIVE_ACTIONS.includes(actionKey)) {
          return ApiResponse.error(
            res,
            `Access denied. Administrative action '${actionKey}' requires explicit permission.`,
            403
          );
        }

        // Standard operational actions default to parent feature state
        if (!permissions[parent]) {
          return ApiResponse.error(
            res,
            `Access denied. Module '${parent}' is disabled.`,
            403
          );
        }
      }
    }

    next();
  };
}
