import { prisma } from '../config/db';
import { RoleType } from '../types/crm.types';

export class NotificationService {
  static async sendNotification({
    userId,
    type = 'system',
    title,
    message,
    relatedType,
    relatedId,
  }: {
    userId: string;
    type?: string;
    title: string;
    message: string;
    relatedType?: string;
    relatedId?: string;
  }) {
    try {
      return await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          relatedType,
          relatedId,
        },
      });
    } catch (err) {
      console.warn('[Notification Service]: Failed to create notification', err);
      return null;
    }
  }

  static async notifyAdmins({
    type = 'system',
    title,
    message,
    relatedType,
    relatedId,
  }: {
    type?: string;
    title: string;
    message: string;
    relatedType?: string;
    relatedId?: string;
  }) {
    try {
      const admins = await prisma.user.findMany({
        where: { role: RoleType.ADMIN, isActive: true },
        select: { id: true },
      });

      const promises = admins.map((admin) =>
        prisma.notification.create({
          data: {
            userId: admin.id,
            type,
            title,
            message,
            relatedType,
            relatedId,
          },
        })
      );

      await Promise.all(promises);
    } catch (err) {
      console.warn('[Notification Service]: Failed to notify admins', err);
    }
  }
}
