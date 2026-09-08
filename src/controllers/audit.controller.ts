import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

export class AuditController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { entityType, employeeId, limit } = req.query;

      const whereClause: any = {};
      if (entityType) {
        whereClause.entityType = entityType as string;
      }

      if (employeeId) {
        const emp = await prisma.employee.findFirst({
          where: {
            OR: [
              { id: employeeId as string },
              { employeeCode: employeeId as string },
              { userId: employeeId as string },
            ],
          },
        });

        const orConditions: any[] = [];
        if (emp?.userId) {
          orConditions.push({ actorUserId: emp.userId });
        }
        if (emp?.id) {
          orConditions.push({ entityId: emp.id });
          orConditions.push({ metadata: { contains: emp.name } });
        }
        if (orConditions.length > 0) {
          whereClause.OR = orConditions;
        }
      }

      const takeCount = limit ? parseInt(limit as string, 10) : 100;

      const logs = await prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              employee: { select: { name: true, employeeCode: true } },
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

  static async getEmployeeActivity(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const emp = await prisma.employee.findFirst({
        where: {
          OR: [
            { id },
            { employeeCode: id },
            { userId: id },
          ],
        },
      });

      if (!emp) {
        return ApiResponse.error(res, 'Employee not found', 404);
      }

      const orConditions: any[] = [];
      if (emp.userId) {
        orConditions.push({ actorUserId: emp.userId });
      }
      orConditions.push({ entityId: emp.id });
      orConditions.push({ metadata: { contains: emp.name } });
      orConditions.push({ metadata: { contains: emp.employeeCode } });

      const logs = await prisma.auditLog.findMany({
        where: { OR: orConditions },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              employee: { select: { name: true, employeeCode: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return ApiResponse.success(res, logs, `Activity history for ${emp.name}`);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
