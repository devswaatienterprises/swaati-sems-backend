import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

export class AuditController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { entityType, limit } = req.query;

      const whereClause: any = {};
      if (entityType) {
        whereClause.entityType = entityType as string;
      }

      const takeCount = limit ? parseInt(limit as string, 10) : 50;

      const logs = await prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              employee: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: takeCount,
      });

      return ApiResponse.success(res, logs, 'Audit logs retrieved');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
