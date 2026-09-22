import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { AuditService } from '../services/audit.service';
import { SequenceService } from '../services/sequence.service';

export class RoleController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { departmentId, status } = req.query;

      const whereClause: any = {};
      if (departmentId && departmentId !== 'ALL') whereClause.departmentId = departmentId as string;
      if (status === 'Active') whereClause.active = true;
      if (status === 'Inactive') whereClause.active = false;

      const roles = await prisma.role.findMany({
        where: whereClause,
        include: {
          department: { select: { id: true, name: true, active: true } },
          recurringTasks: true,
          _count: { select: { employees: true, recurringTasks: true } },
        },
        orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
      });

      return ApiResponse.success(res, roles, 'Roles fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          department: true,
          recurringTasks: true,
          employees: {
            select: {
              id: true,
              employeeCode: true,
              name: true,
              email: true,
              active: true,
            },
          },
          _count: { select: { employees: true, recurringTasks: true } },
        },
      });

      if (!role) {
        return ApiResponse.error(res, 'Role not found', 404);
      }

      return ApiResponse.success(res, role, 'Role fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, departmentId, description, active, recurringTasks } = req.body;

      if (!name || !name.trim()) {
        return ApiResponse.error(res, 'Role name is required', 400);
      }

      if (!departmentId) {
        return ApiResponse.error(res, 'Department is required for creating a Role', 400);
      }

      const trimmedName = name.trim();

      // Check department exists
      const deptExists = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!deptExists) {
        return ApiResponse.error(res, 'Selected Department does not exist', 400);
      }

      // Check duplicate role name within same department
      const existing = await prisma.role.findFirst({
        where: {
          departmentId,
          name: { equals: trimmedName, mode: 'insensitive' },
        },
      });

      if (existing) {
        return ApiResponse.error(
          res,
          `A role with the name "${trimmedName}" already exists in ${deptExists.name}.`,
          400
        );
      }

      // Fetch creator employee record if available for assignedById
      const creatorEmployee = req.user?.id
        ? await prisma.employee.findFirst({ where: { userRefId: req.user.id } })
        : null;

      let fallbackAssignerId = creatorEmployee?.id;
      if (!fallbackAssignerId) {
        const adminEmp = await prisma.employee.findFirst({ where: { active: true } });
        fallbackAssignerId = adminEmp?.id || '';
      }

      // Transaction to create Role and any configured recurring tasks
      const createdRole = await prisma.$transaction(async (tx) => {
        const newRole = await tx.role.create({
          data: {
            name: trimmedName,
            departmentId,
            description: description?.trim() || null,
            active: active !== undefined ? Boolean(active) : true,
          },
        });

        if (Array.isArray(recurringTasks) && recurringTasks.length > 0 && fallbackAssignerId) {
          for (const taskTpl of recurringTasks) {
            if (!taskTpl.title || !taskTpl.title.trim()) continue;

            const recurringCode = await SequenceService.getNextRecurringTaskCode();
            await tx.recurringTask.create({
              data: {
                recurringCode,
                title: taskTpl.title.trim(),
                description: taskTpl.description?.trim() || null,
                priority: (taskTpl.priority || 'MEDIUM').toUpperCase(),
                frequency: (taskTpl.frequency || 'DAILY').toUpperCase(),
                daysOfWeek: Array.isArray(taskTpl.daysOfWeek) ? taskTpl.daysOfWeek : [],
                dayOfMonth: taskTpl.dayOfMonth ? parseInt(taskTpl.dayOfMonth, 10) : null,
                startDate: taskTpl.startDate ? new Date(taskTpl.startDate) : new Date(),
                endDate: taskTpl.endDate ? new Date(taskTpl.endDate) : null,
                dueTime: taskTpl.dueTime || '18:30',
                workingDaysOnly: taskTpl.workingDaysOnly !== undefined ? Boolean(taskTpl.workingDaysOnly) : true,
                active: taskTpl.active !== undefined ? Boolean(taskTpl.active) : true,
                roleId: newRole.id,
                assignedById: fallbackAssignerId,
              },
            });
          }
        }

        return tx.role.findUnique({
          where: { id: newRole.id },
          include: {
            department: true,
            recurringTasks: true,
            _count: { select: { employees: true, recurringTasks: true } },
          },
        });
      });

      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'ROLE_CREATED',
        entityType: 'Role',
        entityId: createdRole?.id || '',
        newValue: JSON.stringify(createdRole),
      });

      return ApiResponse.success(res, createdRole, 'Role created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, departmentId, description, active, recurringTasks } = req.body;

      const existingRole = await prisma.role.findUnique({
        where: { id },
        include: { recurringTasks: true },
      });

      if (!existingRole) {
        return ApiResponse.error(res, 'Role not found', 404);
      }

      const targetDeptId = departmentId || existingRole.departmentId;

      if (name !== undefined) {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return ApiResponse.error(res, 'Role name cannot be empty', 400);
        }

        const duplicate = await prisma.role.findFirst({
          where: {
            departmentId: targetDeptId,
            name: { equals: trimmedName, mode: 'insensitive' },
            id: { not: id },
          },
        });

        if (duplicate) {
          return ApiResponse.error(
            res,
            `A role with the name "${trimmedName}" already exists in this department.`,
            400
          );
        }
      }

      // Fetch creator employee record if available for assignedById
      const creatorEmployee = req.user?.id
        ? await prisma.employee.findFirst({ where: { userRefId: req.user.id } })
        : null;

      let fallbackAssignerId = creatorEmployee?.id;
      if (!fallbackAssignerId) {
        const adminEmp = await prisma.employee.findFirst({ where: { active: true } });
        fallbackAssignerId = adminEmp?.id || '';
      }

      const updatedRole = await prisma.$transaction(async (tx) => {
        // 1. Update basic Role details
        const roleData: any = {};
        if (name !== undefined) roleData.name = name.trim();
        if (departmentId !== undefined) roleData.departmentId = departmentId;
        if (description !== undefined) roleData.description = description.trim() || null;
        if (active !== undefined) roleData.active = Boolean(active);

        await tx.role.update({
          where: { id },
          data: roleData,
        });

        // 2. Handle Recurring Tasks updates if provided
        if (Array.isArray(recurringTasks) && fallbackAssignerId) {
          const providedIds = recurringTasks.map((t) => t.id).filter(Boolean);

          // Delete recurring task templates associated with role that are not in providedIds
          await tx.recurringTask.deleteMany({
            where: {
              roleId: id,
              id: { notIn: providedIds },
            },
          });

          // Upsert provided task templates
          for (const taskTpl of recurringTasks) {
            if (!taskTpl.title || !taskTpl.title.trim()) continue;

            if (taskTpl.id) {
              await tx.recurringTask.update({
                where: { id: taskTpl.id },
                data: {
                  title: taskTpl.title.trim(),
                  description: taskTpl.description?.trim() || null,
                  priority: (taskTpl.priority || 'MEDIUM').toUpperCase(),
                  frequency: (taskTpl.frequency || 'DAILY').toUpperCase(),
                  daysOfWeek: Array.isArray(taskTpl.daysOfWeek) ? taskTpl.daysOfWeek : [],
                  dayOfMonth: taskTpl.dayOfMonth ? parseInt(taskTpl.dayOfMonth, 10) : null,
                  dueTime: taskTpl.dueTime || '18:30',
                  workingDaysOnly: taskTpl.workingDaysOnly !== undefined ? Boolean(taskTpl.workingDaysOnly) : true,
                  active: taskTpl.active !== undefined ? Boolean(taskTpl.active) : true,
                },
              });
            } else {
              const recurringCode = await SequenceService.getNextRecurringTaskCode();
              await tx.recurringTask.create({
                data: {
                  recurringCode,
                  title: taskTpl.title.trim(),
                  description: taskTpl.description?.trim() || null,
                  priority: (taskTpl.priority || 'MEDIUM').toUpperCase(),
                  frequency: (taskTpl.frequency || 'DAILY').toUpperCase(),
                  daysOfWeek: Array.isArray(taskTpl.daysOfWeek) ? taskTpl.daysOfWeek : [],
                  dayOfMonth: taskTpl.dayOfMonth ? parseInt(taskTpl.dayOfMonth, 10) : null,
                  startDate: taskTpl.startDate ? new Date(taskTpl.startDate) : new Date(),
                  endDate: taskTpl.endDate ? new Date(taskTpl.endDate) : null,
                  dueTime: taskTpl.dueTime || '18:30',
                  workingDaysOnly: taskTpl.workingDaysOnly !== undefined ? Boolean(taskTpl.workingDaysOnly) : true,
                  active: taskTpl.active !== undefined ? Boolean(taskTpl.active) : true,
                  roleId: id,
                  assignedById: fallbackAssignerId,
                },
              });
            }
          }
        }

        return tx.role.findUnique({
          where: { id },
          include: {
            department: true,
            recurringTasks: true,
            _count: { select: { employees: true, recurringTasks: true } },
          },
        });
      });

      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'ROLE_UPDATED',
        entityType: 'Role',
        entityId: id,
        oldValue: JSON.stringify(existingRole),
        newValue: JSON.stringify(updatedRole),
      });

      return ApiResponse.success(res, updatedRole, 'Role updated successfully');
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

      const existingRole = await prisma.role.findUnique({ where: { id } });
      if (!existingRole) {
        return ApiResponse.error(res, 'Role not found', 404);
      }

      const updatedRole = await prisma.role.update({
        where: { id },
        data: { active: Boolean(active) },
        include: {
          department: true,
          recurringTasks: true,
          _count: { select: { employees: true, recurringTasks: true } },
        },
      });

      await AuditService.log({
        actorUserId: req.user?.id,
        action: active ? 'ROLE_ACTIVATED' : 'ROLE_DEACTIVATED',
        entityType: 'Role',
        entityId: id,
        oldValue: JSON.stringify(existingRole),
        newValue: JSON.stringify(updatedRole),
      });

      return ApiResponse.success(
        res,
        updatedRole,
        `Role ${active ? 'activated' : 'deactivated'} successfully`
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
