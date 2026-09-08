import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { RoleType } from '../types/crm.types';
import { SequenceService } from '../services/sequence.service';
import { RecurringTaskService } from '../services/recurringTask.service';
import { AuditService } from '../services/audit.service';

export class RecurringTaskController {
  /**
   * Get all recurring task templates.
   */
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const userRole = req.user?.role;
      const employeeId = req.user?.employeeId;
      const canViewTeam = userRole === RoleType.ADMIN || Boolean(req.user?.permissions?.['tasks.view_team']);

      const whereClause: any = {};
      if (!canViewTeam) {
        whereClause.OR = [
          { assignedToId: employeeId },
          { assignedById: employeeId },
        ];
      }

      const templates = await prisma.recurringTask.findMany({
        where: whereClause,
        include: {
          assignedTo: {
            select: { id: true, name: true, employeeCode: true, designation: true, department: true },
          },
          assignedBy: {
            select: { id: true, name: true, employeeCode: true, designation: true },
          },
          _count: {
            select: { occurrences: true, tasks: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return ApiResponse.success(res, templates, 'Recurring task templates fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Get single recurring task template by ID.
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const template = await prisma.recurringTask.findUnique({
        where: { id },
        include: {
          assignedTo: {
            select: { id: true, name: true, employeeCode: true, designation: true, department: true },
          },
          assignedBy: {
            select: { id: true, name: true, employeeCode: true, designation: true },
          },
          occurrences: {
            orderBy: { occurrenceDate: 'desc' },
            take: 15,
            include: {
              task: {
                select: { id: true, taskCode: true, status: true, completedAt: true, deadline: true },
              },
            },
          },
        },
      });

      if (!template) {
        return ApiResponse.error(res, 'Recurring task template not found', 404);
      }

      return ApiResponse.success(res, template, 'Recurring task template fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Create a new recurring task template.
   */
  static async create(req: AuthRequest, res: Response) {
    try {
      const {
        title,
        description,
        priority,
        frequency,
        daysOfWeek,
        dayOfMonth,
        startDate,
        endDate,
        dueTime,
        workingDaysOnly,
        assignedToId,
        active,
      } = req.body;

      if (!title || !frequency || !startDate || !assignedToId) {
        return ApiResponse.error(res, 'Title, frequency, startDate, and assignedToId are required', 400);
      }

      const currentEmpId = req.user?.employeeId;
      if (!currentEmpId) {
        return ApiResponse.error(res, 'Creator employee profile not found in session', 400);
      }

      // Resolve employee
      const targetEmp = await prisma.employee.findFirst({
        where: {
          OR: [
            { id: assignedToId },
            { employeeCode: assignedToId },
            { userId: assignedToId },
          ],
        },
      });

      if (!targetEmp) {
        return ApiResponse.error(res, 'Target employee not found', 404);
      }

      const recurringCode = await SequenceService.getNextRecurringTaskCode();

      const template = await prisma.recurringTask.create({
        data: {
          recurringCode,
          title: title.trim(),
          description: description?.trim() || null,
          priority: (priority || 'MEDIUM').toUpperCase(),
          frequency: frequency.toUpperCase(),
          daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek : [],
          dayOfMonth: dayOfMonth ? parseInt(dayOfMonth, 10) : null,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          dueTime: dueTime?.trim() || null,
          workingDaysOnly: workingDaysOnly !== undefined ? Boolean(workingDaysOnly) : true,
          active: active !== undefined ? Boolean(active) : true,
          assignedToId: targetEmp.id,
          assignedById: currentEmpId,
        },
        include: {
          assignedTo: { select: { id: true, name: true, employeeCode: true, designation: true } },
          assignedBy: { select: { id: true, name: true, employeeCode: true, designation: true } },
        },
      });

      // If active, attempt generation for today immediately
      if (template.active) {
        await RecurringTaskService.generateForTemplate(template.id);
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'RECURRING_TASK_CREATED',
        entityType: 'RecurringTask',
        entityId: template.id,
        metadata: {
          recurringCode: template.recurringCode,
          title: template.title,
          assignedTo: targetEmp.name,
          frequency: template.frequency,
        },
      });

      return ApiResponse.success(res, template, 'Recurring task created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Update an existing recurring task template.
   */
  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        priority,
        frequency,
        daysOfWeek,
        dayOfMonth,
        startDate,
        endDate,
        dueTime,
        workingDaysOnly,
        assignedToId,
        active,
      } = req.body;

      const existing = await prisma.recurringTask.findUnique({ where: { id } });
      if (!existing) {
        return ApiResponse.error(res, 'Recurring task template not found', 404);
      }

      let finalAssignedToId = existing.assignedToId;
      if (assignedToId && assignedToId !== existing.assignedToId) {
        const targetEmp = await prisma.employee.findFirst({
          where: {
            OR: [
              { id: assignedToId },
              { employeeCode: assignedToId },
              { userId: assignedToId },
            ],
          },
        });
        if (targetEmp) finalAssignedToId = targetEmp.id;
      }

      const updated = await prisma.recurringTask.update({
        where: { id },
        data: {
          title: title !== undefined ? title.trim() : existing.title,
          description: description !== undefined ? description?.trim() || null : existing.description,
          priority: priority !== undefined ? priority.toUpperCase() : existing.priority,
          frequency: frequency !== undefined ? frequency.toUpperCase() : existing.frequency,
          daysOfWeek: daysOfWeek !== undefined ? (Array.isArray(daysOfWeek) ? daysOfWeek : []) : existing.daysOfWeek,
          dayOfMonth: dayOfMonth !== undefined ? (dayOfMonth ? parseInt(dayOfMonth, 10) : null) : existing.dayOfMonth,
          startDate: startDate ? new Date(startDate) : existing.startDate,
          endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : existing.endDate,
          dueTime: dueTime !== undefined ? dueTime?.trim() || null : existing.dueTime,
          workingDaysOnly: workingDaysOnly !== undefined ? Boolean(workingDaysOnly) : existing.workingDaysOnly,
          active: active !== undefined ? Boolean(active) : existing.active,
          assignedToId: finalAssignedToId,
        },
        include: {
          assignedTo: { select: { id: true, name: true, employeeCode: true, designation: true } },
          assignedBy: { select: { id: true, name: true, employeeCode: true, designation: true } },
        },
      });

      // If active, attempt generation for today immediately if not already generated
      if (updated.active) {
        await RecurringTaskService.generateForTemplate(updated.id);
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'RECURRING_TASK_UPDATED',
        entityType: 'RecurringTask',
        entityId: updated.id,
        metadata: {
          recurringCode: updated.recurringCode,
          title: updated.title,
        },
      });

      return ApiResponse.success(res, updated, 'Recurring task template updated successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Pause or Activate a recurring task template.
   */
  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { active } = req.body;

      if (active === undefined) {
        return ApiResponse.error(res, 'Active status boolean is required', 400);
      }

      const updated = await prisma.recurringTask.update({
        where: { id },
        data: { active: Boolean(active) },
        include: {
          assignedTo: { select: { id: true, name: true, employeeCode: true } },
        },
      });

      if (updated.active) {
        await RecurringTaskService.generateForTemplate(updated.id);
      }

      await AuditService.log({
        actorUserId: req.user?.id,
        action: updated.active ? 'RECURRING_TASK_ACTIVATED' : 'RECURRING_TASK_PAUSED',
        entityType: 'RecurringTask',
        entityId: updated.id,
        metadata: {
          recurringCode: updated.recurringCode,
          active: updated.active,
        },
      });

      return ApiResponse.success(
        res,
        updated,
        `Recurring task ${updated.active ? 'activated' : 'paused'} successfully`
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Delete a recurring task template (historical tasks remain unaffected).
   */
  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const template = await prisma.recurringTask.findUnique({ where: { id } });
      if (!template) {
        return ApiResponse.error(res, 'Recurring task template not found', 404);
      }

      await prisma.recurringTask.delete({
        where: { id },
      });

      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'RECURRING_TASK_DELETED',
        entityType: 'RecurringTask',
        entityId: id,
        metadata: { recurringCode: template.recurringCode, title: template.title },
      });

      return ApiResponse.success(res, null, 'Recurring task template deleted. Existing tasks remain intact.');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Manually trigger generation of all due recurring tasks for today.
   */
  static async generate(req: AuthRequest, res: Response) {
    try {
      const result = await RecurringTaskService.generateDueTasks();
      return ApiResponse.success(res, result, `Generated ${result.generatedCount} due tasks`);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
