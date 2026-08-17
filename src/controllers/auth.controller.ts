import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return ApiResponse.error(res, 'Email and password are required', 400);
      }

      const user = await prisma.user.findUnique({
        where: { email },
        include: { employee: true },
      });

      if (!user || !user.isActive) {
        return ApiResponse.error(res, 'Invalid credentials or inactive account', 401);
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

      // Generate JWT Token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          employeeId: user.employee?.id,
        },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Set Secure HTTP-Only Cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return ApiResponse.success(
        res,
        {
          token,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            employee: user.employee,
          },
        },
        'Authentication successful'
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
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          lastLogin: true,
          employee: true,
        },
      });

      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      return ApiResponse.success(res, user, 'User profile fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async logout(req: Request, res: Response) {
    res.clearCookie('token');
    return ApiResponse.success(res, null, 'Logged out successfully');
  }
}
