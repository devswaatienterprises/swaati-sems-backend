import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { Priority, RoleType, TaskStatus } from '../types/crm.types';
import { NotificationService } from '../services/notification.service';
import { AuditService } from '../services/audit.service';

export class TaskController {
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

      const tasks = await prisma.task.findMany({
        where: whereClause,
        include: {
          assignedTo: { select: { name: true, employeeCode: true, designation: true } },
          assignedBy: { select: { name: true, employeeCode: true, designation: true } },
          comments: { orderBy: { createdAt: 'desc' } },
          history: { orderBy: { changedAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return ApiResponse.success(res, tasks, 'Tasks fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { title, description, priority, startDate, deadline, assignedToId, category, reminderTime } = req.body;

      if (!title || !deadline || !assignedToId) {
        return ApiResponse.error(res, 'Title, deadline, and assignedToId are required', 400);
      }

      const currentEmpId = req.user?.employeeId;
      if (!currentEmpId) {
        return ApiResponse.error(res, 'Assigner employee profile not found', 400);
      }

      // Resolve employee by UUID, employeeCode, or user_id
      const targetEmp = await prisma.employee.findFirst({
        where: {
          OR: [
            { id: assignedToId },
            { employeeCode: assignedToId },
            { userId: assignedToId },
          ],
        },
      });

      const finalAssignedToId = targetEmp ? targetEmp.id : assignedToId;

      const count = await prisma.task.count();
      const taskCode = `TSK-${500 + count + 1}`;

      const task = await prisma.task.create({
        data: {
          taskCode,
          title,
          description,
          priority: (priority?.toUpperCase() as Priority) || Priority.MEDIUM,
          status: TaskStatus.TODO,
          category,
          startDate: startDate ? new Date(startDate) : new Date(),
          deadline: new Date(deadline),
          reminderTime,
          assignedToId: finalAssignedToId,
          assignedById: currentEmpId,
        },
        include: {
          assignedTo: { include: { user: true } },
          assignedBy: true,
        },
      });

      // Record in task assignment history
      await prisma.taskAssignmentHistory.create({
        data: {
          taskId: task.id,
          previousAssigneeId: null,
          newAssigneeId: finalAssignedToId,
          changedBy: req.user?.email || 'Admin',
        },
      });

      // Notify Assignee
      if (task.assignedTo?.userRefId) {
        await NotificationService.sendNotification({
          userId: task.assignedTo.userRefId,
          type: 'task_assigned',
          title: 'New Task Assigned',
          message: `"${title}" has been assigned to you by ${task.assignedBy.name}. Deadline: ${deadline}`,
          relatedType: 'Task',
          relatedId: task.id,
        });
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'TASK_CREATED',
        entityType: 'Task',
        entityId: task.id,
        metadata: { title: task.title, assignedTo: task.assignedTo?.name },
      });

      return ApiResponse.success(res, task, 'Task created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const isCompleted = status === 'COMPLETED' || status === 'Completed';

      const task = await prisma.task.update({
        where: { id },
        data: {
          status: status as TaskStatus,
          completedAt: isCompleted ? new Date() : null,
        },
      });

      return ApiResponse.success(res, task, 'Task status updated');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async reassign(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { newAssigneeId } = req.body;

      if (!newAssigneeId) {
        return ApiResponse.error(res, 'New assignee ID is required', 400);
      }

      const existingTask = await prisma.task.findUnique({
        where: { id },
      });

      if (!existingTask) {
        return ApiResponse.error(res, 'Task not found', 404);
      }

      const targetEmp = await prisma.employee.findFirst({
        where: {
          OR: [
            { id: newAssigneeId },
            { employeeCode: newAssigneeId },
            { userId: newAssigneeId },
          ],
        },
      });

      const finalNewAssigneeId = targetEmp ? targetEmp.id : newAssigneeId;
      const previousAssigneeId = existingTask.assignedToId;

      const updated = await prisma.task.update({
        where: { id },
        data: { assignedToId: finalNewAssigneeId },
        include: { assignedTo: { include: { user: true } } },
      });

      // Record assignment history
      await prisma.taskAssignmentHistory.create({
        data: {
          taskId: id,
          previousAssigneeId,
          newAssigneeId: finalNewAssigneeId,
          changedBy: req.user?.email || 'Admin',
        },
      });

      // Notify new assignee
      if (updated.assignedTo.userRefId) {
        await NotificationService.sendNotification({
          userId: updated.assignedTo.userRefId,
          type: 'task_assigned',
          title: 'Task Reassigned to You',
          message: `Task "${updated.title}" has been reassigned to you.`,
          relatedType: 'Task',
          relatedId: id,
        });
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'TASK_REASSIGNED',
        entityType: 'Task',
        entityId: id,
        metadata: { title: updated.title, newAssignee: updated.assignedTo.name },
      });

      return ApiResponse.success(res, updated, 'Task reassigned successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async addComment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { content } = req.body;

      if (!content) {
        return ApiResponse.error(res, 'Comment content is required', 400);
      }

      const comment = await prisma.taskComment.create({
        data: {
          taskId: id,
          author: req.user?.email || 'Staff',
          content,
        },
      });

      return ApiResponse.success(res, comment, 'Comment added successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
