import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { LeaveStatus, RoleType } from '../types/crm.types';
import { NotificationService } from '../services/notification.service';
import { AuditService } from '../services/audit.service';

export class LeaveController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const userRole = req.user?.role;
      const employeeId = req.user?.employeeId;
      const canViewTeam = userRole === RoleType.ADMIN || Boolean(req.user?.permissions?.['leave.view_team']);

      const whereClause: any = {};
      if (!canViewTeam) {
        whereClause.employeeId = employeeId;
      }

      const leaves = await prisma.leaveRequest.findMany({
        where: whereClause,
        include: {
          employee: {
            select: {
              name: true,
              employeeCode: true,
              department: true,
              designation: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return ApiResponse.success(res, leaves, 'Leave requests fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) {
        return ApiResponse.error(res, 'No employee record associated with this account', 400);
      }

      const { leaveType, startDate, endDate, totalDays, reason } = req.body;

      if (!startDate || !endDate || !reason) {
        return ApiResponse.error(res, 'Start date, end date, and reason are required', 400);
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start > end) {
        return ApiResponse.error(res, 'End date cannot be earlier than start date.', 400);
      }

      // Check for overlapping approved/pending leaves for this employee
      const overlapping = await prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
          OR: [
            { startDate: { lte: end }, endDate: { gte: start } },
          ],
        },
      });

      if (overlapping) {
        return ApiResponse.error(
          res,
          'You already have a pending or approved leave request covering these dates.',
          400
        );
      }

      const leave = await prisma.leaveRequest.create({
        data: {
          employeeId,
          leaveType: leaveType || 'Casual Leave',
          startDate: start,
          endDate: end,
          totalDays: totalDays ? parseFloat(totalDays) : 1,
          reason,
          status: LeaveStatus.PENDING,
          appliedAt: new Date(),
        },
        include: { employee: true },
      });

      // Notify Admins
      await NotificationService.notifyAdmins({
        type: 'leave_submitted',
        title: 'New Leave Application',
        message: `${leave.employee.name} applied for ${leave.leaveType} (${startDate} to ${endDate}).`,
        relatedType: 'LeaveRequest',
        relatedId: leave.id,
      });

      return ApiResponse.success(res, leave, 'Leave request submitted successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status, reviewerRemarks } = req.body; // 'APPROVED' | 'REJECTED'

      const leave = await prisma.leaveRequest.update({
        where: { id },
        data: {
          status: status as LeaveStatus,
          reviewerRemarks,
          reviewedBy: req.user?.email || 'Admin',
          reviewedAt: new Date(),
        },
        include: { employee: { include: { user: true } } },
      });

      // Notify Employee
      if (leave.employee.userRefId) {
        await NotificationService.sendNotification({
          userId: leave.employee.userRefId,
          type: status === 'APPROVED' ? 'leave_approved' : 'leave_rejected',
          title: `Leave Request ${status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
          message: `Your leave request for ${leave.startDate.toISOString().split('T')[0]} has been ${status.toLowerCase()}.${reviewerRemarks ? ` Remarks: ${reviewerRemarks}` : ''}`,
          relatedType: 'LeaveRequest',
          relatedId: id,
        });
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: `LEAVE_${status}`,
        entityType: 'LeaveRequest',
        entityId: id,
        metadata: { employeeName: leave.employee.name, status, reviewerRemarks },
      });

      return ApiResponse.success(res, leave, `Leave request has been ${status.toLowerCase()}`);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async cancel(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const employeeId = req.user?.employeeId;

      const leave = await prisma.leaveRequest.findUnique({
        where: { id },
      });

      if (!leave) {
        return ApiResponse.error(res, 'Leave request not found', 404);
      }

      if (req.user?.role !== RoleType.ADMIN && leave.employeeId !== employeeId) {
        return ApiResponse.error(res, 'You are not authorized to cancel this leave request', 403);
      }

      if (leave.status !== LeaveStatus.PENDING) {
        return ApiResponse.error(res, 'Only pending leave requests can be cancelled', 400);
      }

      const updated = await prisma.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      return ApiResponse.success(res, updated, 'Leave request cancelled successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
