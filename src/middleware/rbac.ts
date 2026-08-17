import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { ApiResponse } from '../utils/apiResponse';
import { RoleType } from '@prisma/client';

export function authorize(allowedRoles: RoleType[] = []) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthenticated request', 401);
    }

    const userRole = req.user.role as RoleType;

    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      return ApiResponse.error(
        res,
        `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
        403
      );
    }

    next();
  };
}
