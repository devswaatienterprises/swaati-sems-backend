import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { Priority, TaskStatus } from '@prisma/client';

export class TaskController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      let tasks;

      if (user?.role === 'EMPLOYEE' && user.employeeId) {
        tasks = await prisma.task.findMany({
          where: { assignedToId: user.employeeId },
          include: { assignedTo: true, createdBy: true },
          orderBy: { createdAt: 'desc' },
        });
      } else {
        tasks = await prisma.task.findMany({
          include: { assignedTo: true, createdBy: true },
          orderBy: { createdAt: 'desc' },
        });
      }

      return ApiResponse.success(res, tasks, 'Tasks fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { title, description, assignedToId, priority, category, dueDate } = req.body;
      const creatorId = req.user?.employeeId || (await prisma.employee.findFirst())?.id;

      if (!title || !assignedToId || !creatorId) {
        return ApiResponse.error(res, 'Title and assigned employee are required', 400);
      }

      const count = await prisma.task.count();
      const taskCode = `TSK-${500 + count + 1}`;

      const newTask = await prisma.task.create({
        data: {
          taskCode,
          title,
          description,
          priority: (priority as Priority) || Priority.MEDIUM,
          status: TaskStatus.TODO,
          category: category || 'Site Survey',
          startDate: new Date(),
          dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 86400000 * 2),
          assignedToId,
          createdById: creatorId,
        },
        include: { assignedTo: true, createdBy: true },
      });

      return ApiResponse.success(res, newTask, 'Task created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updated = await prisma.task.update({
        where: { id },
        data: { status: status as TaskStatus },
        include: { assignedTo: true },
      });

      return ApiResponse.success(res, updated, 'Task status updated');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
