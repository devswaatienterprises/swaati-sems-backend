import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { AttendanceStatus } from '@prisma/client';

export class AttendanceController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const attendanceLogs = await prisma.attendance.findMany({
        include: { employee: true },
        orderBy: { date: 'desc' },
      });
      return ApiResponse.success(res, attendanceLogs, 'Attendance logs fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async checkIn(req: AuthRequest, res: Response) {
    try {
      const employeeId = req.user?.employeeId || (await prisma.employee.findFirst())?.id;
      if (!employeeId) {
        return ApiResponse.error(res, 'Employee ID not found', 400);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if already checked in today
      const existing = await prisma.attendance.findFirst({
        where: {
          employeeId,
          date: today,
        },
      });

      if (existing) {
        return ApiResponse.error(res, 'Already checked in today', 400);
      }

      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isLate = now.getHours() >= 9 && now.getMinutes() > 15;

      const record = await prisma.attendance.create({
        data: {
          date: today,
          checkIn: timeString,
          checkOut: '-',
          workingHours: '0 hrs',
          status: isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
          employeeId,
        },
        include: { employee: true },
      });

      return ApiResponse.success(res, record, 'Check-in recorded', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async checkOut(req: AuthRequest, res: Response) {
    try {
      const employeeId = req.user?.employeeId || (await prisma.employee.findFirst())?.id;
      if (!employeeId) {
        return ApiResponse.error(res, 'Employee ID not found', 400);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await prisma.attendance.findFirst({
        where: {
          employeeId,
          date: today,
        },
      });

      if (!existing) {
        return ApiResponse.error(res, 'No active check-in record found for today', 400);
      }

      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const updated = await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          checkOut: timeString,
          workingHours: '9.0 hrs',
        },
        include: { employee: true },
      });

      return ApiResponse.success(res, updated, 'Check-out recorded');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
