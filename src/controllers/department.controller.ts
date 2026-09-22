import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { AuditService } from '../services/audit.service';

export class DepartmentController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { status } = req.query;
      const whereClause: any = {};
      if (status === 'Active') whereClause.active = true;
      if (status === 'Inactive') whereClause.active = false;

      const departments = await prisma.department.findMany({
        where: whereClause,
        include: {
          roles: {
            select: {
              id: true,
              name: true,
              active: true,
              _count: { select: { employees: true, recurringTasks: true } },
            },
          },
          _count: {
            select: { employees: true, roles: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      return ApiResponse.success(res, departments, 'Departments fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const department = await prisma.department.findUnique({
        where: { id },
        include: {
          roles: {
            include: {
              recurringTasks: true,
              _count: { select: { employees: true } },
            },
          },
          employees: {
            select: {
              id: true,
              employeeCode: true,
              name: true,
              email: true,
              designation: true,
              active: true,
            },
          },
        },
      });

      if (!department) {
        return ApiResponse.error(res, 'Department not found', 404);
      }

      return ApiResponse.success(res, department, 'Department fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, description, active } = req.body;

      if (!name || !name.trim()) {
        return ApiResponse.error(res, 'Department name is required', 400);
      }

      const trimmedName = name.trim();

      // Case-insensitive duplicate name check
      const existing = await prisma.department.findFirst({
        where: {
          name: { equals: trimmedName, mode: 'insensitive' },
        },
      });

      if (existing) {
        return ApiResponse.error(res, `A department with the name "${trimmedName}" already exists.`, 400);
      }

      const department = await prisma.department.create({
        data: {
          name: trimmedName,
          description: description?.trim() || null,
          active: active !== undefined ? Boolean(active) : true,
        },
        include: {
          roles: true,
          _count: { select: { employees: true, roles: true } },
        },
      });

      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'DEPARTMENT_CREATED',
        entityType: 'Department',
        entityId: department.id,
        newValue: JSON.stringify(department),
      });

      return ApiResponse.success(res, department, 'Department created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, active } = req.body;

      const existingDept = await prisma.department.findUnique({ where: { id } });
      if (!existingDept) {
        return ApiResponse.error(res, 'Department not found', 404);
      }

      const updateData: any = {};

      if (name !== undefined) {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return ApiResponse.error(res, 'Department name cannot be empty', 400);
        }

        const duplicate = await prisma.department.findFirst({
          where: {
            name: { equals: trimmedName, mode: 'insensitive' },
            id: { not: id },
          },
        });

        if (duplicate) {
          return ApiResponse.error(res, `A department with the name "${trimmedName}" already exists.`, 400);
        }

        updateData.name = trimmedName;
      }

      if (description !== undefined) {
        updateData.description = description.trim() || null;
      }

      if (active !== undefined) {
        updateData.active = Boolean(active);
      }

      const updatedDept = await prisma.department.update({
        where: { id },
        data: updateData,
        include: {
          roles: true,
          _count: { select: { employees: true, roles: true } },
        },
      });

      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'DEPARTMENT_UPDATED',
        entityType: 'Department',
        entityId: updatedDept.id,
        oldValue: JSON.stringify(existingDept),
        newValue: JSON.stringify(updatedDept),
      });

      return ApiResponse.success(res, updatedDept, 'Department updated successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { active } = req.body;

      if (active === undefined) {
        return ApiResponse.error(res, 'Status (active) is required', 400);
      }

      const existingDept = await prisma.department.findUnique({ where: { id } });
      if (!existingDept) {
        return ApiResponse.error(res, 'Department not found', 404);
      }

      const updatedDept = await prisma.department.update({
        where: { id },
        data: { active: Boolean(active) },
        include: {
          roles: true,
          _count: { select: { employees: true, roles: true } },
        },
      });

      await AuditService.log({
        actorUserId: req.user?.id,
        action: active ? 'DEPARTMENT_ACTIVATED' : 'DEPARTMENT_DEACTIVATED',
        entityType: 'Department',
        entityId: id,
        oldValue: JSON.stringify(existingDept),
        newValue: JSON.stringify(updatedDept),
      });

      return ApiResponse.success(
        res,
        updatedDept,
        `Department ${active ? 'activated' : 'deactivated'} successfully`
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
