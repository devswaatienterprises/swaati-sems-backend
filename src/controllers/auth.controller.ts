import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { AuditService } from '../services/audit.service';

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { email, userId, password } = req.body;

      if ((!email && !userId) || !password) {
        return ApiResponse.error(res, 'Login identifier (Email or User ID) and password are required', 400);
      }

      const identifier = (email || userId).trim().toLowerCase();

      // Find user by email or userId
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: identifier },
            { userId: identifier },
          ],
        },
        include: {
          employee: true,
          permissions: true,
        },
      });

      if (!user) {
        return ApiResponse.error(res, 'Invalid credentials provided.', 401);
      }

      const anyUser = user as any;

      // Check active status on both User and Employee
      if (!anyUser.isActive || (anyUser.employee && !anyUser.employee.active)) {
        return ApiResponse.error(
          res,
          'Your account has been deactivated. Please contact your CRM Administrator.',
          403
        );
      }

      const isMatch = await bcrypt.compare(password, anyUser.passwordHash);
      if (!isMatch) {
        return ApiResponse.error(res, 'Invalid credentials provided.', 401);
      }

      // Update last login
      await prisma.user.update({
        where: { id: anyUser.id },
        data: { lastLogin: new Date() },
      });

      // Build permissions dictionary
      const permissionsMap: Record<string, boolean> = {};
      if (anyUser.permissions) {
        for (const p of anyUser.permissions) {
          permissionsMap[p.featureKey] = p.enabled;
        }
      }

      // Sign JWT
      const token = jwt.sign(
        {
          id: anyUser.id,
          userId: anyUser.userId,
          email: anyUser.email,
          role: anyUser.role,
          employeeId: anyUser.employee?.id,
        },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Set secure cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // Log Login Audit
      await AuditService.log({
        actorUserId: anyUser.id,
        action: 'USER_LOGIN',
        entityType: 'User',
        entityId: anyUser.id,
        metadata: { role: anyUser.role, email: anyUser.email },
      });

      return ApiResponse.success(
        res,
        {
          token,
          user: {
            id: anyUser.id,
            userId: anyUser.userId,
            email: anyUser.email,
            role: anyUser.role,
            employee: anyUser.employee,
            permissions: permissionsMap,
          },
        },
        'Sign-in successful'
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async me(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return ApiResponse.error(res, 'Unauthenticated', 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          employee: true,
          permissions: true,
        },
      });

      if (!user) {
        return ApiResponse.error(res, 'User profile not found', 404);
      }

      const anyUser = user as any;

      const permissionsMap: Record<string, boolean> = {};
      if (anyUser.permissions) {
        for (const p of anyUser.permissions) {
          permissionsMap[p.featureKey] = p.enabled;
        }
      }

      return ApiResponse.success(
        res,
        {
          id: anyUser.id,
          userId: anyUser.userId,
          email: anyUser.email,
          role: anyUser.role,
          isActive: anyUser.isActive,
          employee: anyUser.employee,
          permissions: permissionsMap,
        },
        'User profile retrieved'
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async logout(req: Request, res: Response) {
    res.clearCookie('token');
    return ApiResponse.success(res, null, 'Logged out successfully');
  }
}
