import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

export class NotificationController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const notifications = await prisma.notification.findMany({
        where: userId ? { userId } : {},
        orderBy: { createdAt: 'desc' },
      });
      return ApiResponse.success(res, notifications, 'Notifications fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async markRead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updated = await prisma.notification.update({
        where: { id },
        data: { unread: false },
      });
      return ApiResponse.success(res, updated, 'Notification marked as read');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
