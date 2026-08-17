import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { FollowUpStatus } from '@prisma/client';

export class FollowUpController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const followUps = await prisma.followUp.findMany({
        include: { assignedTo: true },
        orderBy: { followUpDate: 'asc' },
      });
      return ApiResponse.success(res, followUps, 'Follow-ups fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updated = await prisma.followUp.update({
        where: { id },
        data: { status: status as FollowUpStatus },
        include: { assignedTo: true },
      });

      return ApiResponse.success(res, updated, 'Follow-up status updated');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
