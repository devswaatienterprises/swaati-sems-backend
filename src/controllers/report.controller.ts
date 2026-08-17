import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

export class ReportController {
  static async getSummary(req: AuthRequest, res: Response) {
    try {
      const employeeCount = await prisma.employee.count();
      const taskCount = await prisma.task.count();
      const leadCount = await prisma.lead.count();

      return ApiResponse.success(
        res,
        {
          employeeCount,
          taskCount,
          leadCount,
        },
        'Summary report generated'
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
