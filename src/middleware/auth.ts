import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { RoleType } from '../types/crm.types';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    userId?: string;
    email: string;
    role: RoleType;
    employeeId?: string;
    permissions?: Record<string, boolean>;
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return ApiResponse.error(res, 'Authentication required. Please sign in.', 401);
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    // Verify user exists and is active in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        employee: true,
        permissions: true,
      },
    });

    if (!user) {
      return ApiResponse.error(res, 'User session invalid. Please log in again.', 401);
    }

    if (!user.isActive || (user.employee && !user.employee.active)) {
      return ApiResponse.error(
        res,
        'Your account has been deactivated. Please contact your CRM Administrator.',
        403
      );
    }

    const anyUser = user as any;

    // Build permissions map
    const permissionsMap: Record<string, boolean> = {};
    if (anyUser.permissions) {
      for (const p of anyUser.permissions) {
        permissionsMap[p.featureKey] = p.enabled;
      }
    }

    req.user = {
      id: anyUser.id,
      userId: anyUser.userId || undefined,
      email: anyUser.email,
      role: anyUser.role as RoleType,
      employeeId: anyUser.employee?.id,
      permissions: permissionsMap,
    };

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return ApiResponse.error(res, 'Your session has expired. Please sign in again.', 401);
    }
    return ApiResponse.error(res, 'Invalid authentication token.', 401);
  }
}
