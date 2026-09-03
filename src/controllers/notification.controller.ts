import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

export class NotificationController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const currentUserId = req.user?.id;
      if (!currentUserId) {
        return ApiResponse.error(res, 'Unauthenticated', 401);
      }

      const notifications = await prisma.notification.findMany({
        where: { userId: currentUserId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return ApiResponse.success(res, notifications, 'Notifications retrieved');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async markRead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id;

      const notification = await prisma.notification.findUnique({
        where: { id },
      });

      if (!notification || notification.userId !== currentUserId) {
        return ApiResponse.error(res, 'Notification not found or access denied', 404);
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return ApiResponse.success(res, updated, 'Notification marked as read');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async markAllRead(req: AuthRequest, res: Response) {
    try {
      const currentUserId = req.user?.id;
      if (!currentUserId) {
        return ApiResponse.error(res, 'Unauthenticated', 401);
      }

      await prisma.notification.updateMany({
        where: { userId: currentUserId, isRead: false },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return ApiResponse.success(res, null, 'All notifications marked as read');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
