import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { ApiResponse } from '../utils/apiResponse';

export type RoleType = 'ADMIN' | 'EMPLOYEE';
export const RoleType = {
  ADMIN: 'ADMIN' as RoleType,
  EMPLOYEE: 'EMPLOYEE' as RoleType,
};

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

export function requirePermission(featureKey: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthenticated request', 401);
    }

    // Admin automatically has full permissions
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Check if permission is enabled for employee
    const isPermitted = req.user.permissions?.[featureKey];

    if (!isPermitted) {
      return ApiResponse.error(
        res,
        `Access denied. Feature '${featureKey}' is not activated for your account. Please contact your CRM Administrator.`,
        403
      );
    }

    next();
  };
}
