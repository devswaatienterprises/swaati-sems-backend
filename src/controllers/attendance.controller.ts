import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { AttendanceStatus } from '../types/crm.types';
import { formatTimeIST, getISTDateMidnight } from '../utils/timezone';
import { AuditService } from '../services/audit.service';
import { NotificationService } from '../services/notification.service';

export class AttendanceController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { date, employeeId, department } = req.query;

      const whereClause: any = {};
      if (date) {
        whereClause.attendanceDate = new Date(date as string);
      }
      if (employeeId) {
        whereClause.employeeId = employeeId as string;
      }
      if (department && department !== 'ALL') {
        whereClause.employee = { department: department as string };
      }

      const attendances = await prisma.attendance.findMany({
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
        orderBy: { attendanceDate: 'desc' },
      });

      return ApiResponse.success(res, attendances, 'Attendance records fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async checkIn(req: AuthRequest, res: Response) {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) {
        return ApiResponse.error(res, 'No active employee profile associated with your user session.', 400);
      }

      const now = new Date();
      const todayDate = getISTDateMidnight(now);
      const currentTimeStr = formatTimeIST(now);

      // Check if attendance already recorded today
      const existing = await prisma.attendance.findUnique({
        where: {
          employeeId_attendanceDate: {
            employeeId,
            attendanceDate: todayDate,
          },
        },
      });

      if (existing) {
        return ApiResponse.error(res, 'You have already checked in for today.', 400);
      }

      // Read configurable office start time
      const officeTimeSetting = await prisma.systemSetting.findUnique({
        where: { key: 'officeStartTime' },
      });
      const graceSetting = await prisma.systemSetting.findUnique({
        where: { key: 'gracePeriodMinutes' },
      });

      const officeTimeStr = officeTimeSetting?.value || '10:00 AM';
      const gracePeriodMinutes = graceSetting ? parseInt(graceSetting.value, 10) : 15;

      // Parse configured start time
      const match = officeTimeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      let officeHour = 10;
      let officeMinute = 0;
      if (match) {
        officeHour = parseInt(match[1], 10);
        if (match[3].toUpperCase() === 'PM' && officeHour !== 12) officeHour += 12;
        if (match[3].toUpperCase() === 'AM' && officeHour === 12) officeHour = 0;
        officeMinute = parseInt(match[2], 10);
      }

      // Convert current IST time to minutes from midnight
      const nowISTString = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const [curHourStr, curMinStr] = nowISTString.split(':');
      const curTotalMinutes = parseInt(curHourStr, 10) * 60 + parseInt(curMinStr, 10);
      const officeTotalMinutes = officeHour * 60 + officeMinute;

      const diff = curTotalMinutes - officeTotalMinutes;
      const isLate = diff > gracePeriodMinutes;
      const lateMinutes = isLate ? diff : 0;

      const record = await prisma.attendance.create({
        data: {
          employeeId,
          attendanceDate: todayDate,
          checkIn: currentTimeStr,
          checkOut: '-',
          workingHours: 'In Progress',
          workingMinutes: 0,
          attendanceStatus: isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
          isLate,
          lateMinutes,
        },
      });

      // If late, generate a late arrival notification
      if (isLate && req.user?.id) {
        await NotificationService.sendNotification({
          userId: req.user.id,
          type: 'late',
          title: 'Late Arrival Recorded',
          message: `Checked in at ${currentTimeStr} (${lateMinutes} mins after shift start ${officeTimeStr}).`,
          relatedType: 'Attendance',
          relatedId: record.id,
        });
      }

      return ApiResponse.success(res, record, 'Check-in recorded successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async checkOut(req: AuthRequest, res: Response) {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) {
        return ApiResponse.error(res, 'No active employee profile associated with your user session.', 400);
      }

      const now = new Date();
      const todayDate = getISTDateMidnight(now);
      const currentTimeStr = formatTimeIST(now);

      const attendanceRecord = await prisma.attendance.findUnique({
        where: {
          employeeId_attendanceDate: {
            employeeId,
            attendanceDate: todayDate,
          },
        },
      });

      if (!attendanceRecord) {
        return ApiResponse.error(res, 'Cannot check out: You have not checked in for today.', 400);
      }

      if (attendanceRecord.checkOut !== '-') {
        return ApiResponse.error(res, 'You have already checked out for today.', 400);
      }

      // Calculate working hours
      const checkInParts = attendanceRecord.checkIn.match(/(\d+):(\d+)\s*(AM|PM)/i);
      let inHours = 10;
      let inMins = 0;
      if (checkInParts) {
        inHours = parseInt(checkInParts[1], 10);
        if (checkInParts[3].toUpperCase() === 'PM' && inHours !== 12) inHours += 12;
        if (checkInParts[3].toUpperCase() === 'AM' && inHours === 12) inHours = 0;
        inMins = parseInt(checkInParts[2], 10);
      }

      const nowISTString = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const [curHourStr, curMinStr] = nowISTString.split(':');
      const outTotalMins = parseInt(curHourStr, 10) * 60 + parseInt(curMinStr, 10);
      const inTotalMins = inHours * 60 + inMins;

      const durationMinutes = Math.max(0, outTotalMins - inTotalMins);
      const durationHours = (durationMinutes / 60).toFixed(1);

      const updated = await prisma.attendance.update({
        where: { id: attendanceRecord.id },
        data: {
          checkOut: currentTimeStr,
          workingMinutes: durationMinutes,
          workingHours: `${durationHours} hrs`,
        },
      });

      return ApiResponse.success(res, updated, 'Check-out recorded successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async correct(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const updated = await prisma.attendance.update({
        where: { id },
        data: {
          attendanceStatus: status as AttendanceStatus,
          correctedBy: req.user?.email,
          correctionReason: notes,
        },
        include: { employee: true },
      });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'ATTENDANCE_CORRECTED',
        entityType: 'Attendance',
        entityId: id,
        metadata: { employeeName: updated.employee.name, status, notes },
      });

      return ApiResponse.success(res, updated, 'Attendance record updated by Administrator');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
