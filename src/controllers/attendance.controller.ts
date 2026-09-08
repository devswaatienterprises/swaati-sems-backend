import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { AttendanceStatus, RoleType } from '../types/crm.types';
import { formatTimeIST, getISTDateMidnight } from '../utils/timezone';
import { AuditService } from '../services/audit.service';
import { NotificationService } from '../services/notification.service';

export class AttendanceController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { date, employeeId, department } = req.query;
      const userRole = req.user?.role;
      const currentEmployeeId = req.user?.employeeId;
      const canViewTeam = userRole === RoleType.ADMIN || Boolean(req.user?.permissions?.['attendance.view_team']);

      const whereClause: any = {};
      if (date) {
        whereClause.attendanceDate = new Date(date as string);
      }

      if (!canViewTeam) {
        whereClause.employeeId = currentEmployeeId;
      } else if (employeeId) {
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
      const currentUserId = req.user?.id;
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

      // Check for incomplete tasks assigned to this employee with deadline of today or earlier
      const endOfToday = new Date(todayDate);
      endOfToday.setHours(23, 59, 59, 999);

      const incompleteTasksDueToday = await prisma.task.findMany({
        where: {
          assignedToId: employeeId,
          status: {
            notIn: ['COMPLETED', 'CANCELLED'],
          },
          deadline: {
            lte: endOfToday,
          },
        },
        include: {
          assignedBy: {
            include: { user: true },
          },
        },
      });

      const { taskUpdates } = req.body || {};

      if (incompleteTasksDueToday.length > 0) {
        if (!taskUpdates || !Array.isArray(taskUpdates) || taskUpdates.length === 0) {
          return res.status(400).json({
            success: false,
            requiresTaskCheck: true,
            message: 'You have tasks due today. Please complete them or provide an update before checking out.',
            data: {
              pendingTasks: incompleteTasksDueToday.map((t) => ({
                id: t.id,
                taskCode: t.taskCode,
                title: t.title,
                status: t.status,
                priority: t.priority,
                deadline: t.deadline,
                assignedBy: t.assignedBy?.name,
                assignedById: t.assignedById,
              })),
            },
          });
        }

        // Validate that all incomplete tasks due today have been addressed
        for (const task of incompleteTasksDueToday) {
          const update = taskUpdates.find((u: any) => u.taskId === task.id);
          if (!update) {
            return ApiResponse.error(
              res,
              `Task "${task.title}" is due today. Please mark it Completed or provide an update.`,
              400
            );
          }

          const newStatus = (update.status || task.status).toUpperCase();
          const isCompleted = newStatus === 'COMPLETED';
          const updateNote = (update.updateNote || update.note || '').trim();

          if (!isCompleted && !updateNote) {
            return ApiResponse.error(
              res,
              `Please provide a short update note for incomplete task: "${task.title}".`,
              400
            );
          }

          // Update task in database
          await prisma.task.update({
            where: { id: task.id },
            data: {
              status: isCompleted ? 'COMPLETED' : newStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'TODO',
              completedAt: isCompleted ? new Date() : null,
            },
          });

          // If note is provided, add task comment and send message to assigner
          if (updateNote) {
            await prisma.taskComment.create({
              data: {
                taskId: task.id,
                author: req.user?.email || 'Employee',
                content: `[End-of-Day Check-Out Update]: ${updateNote}`,
              },
            });

            // Send message to the person who assigned the task
            const assignerUserId = task.assignedBy?.userId || task.assignedBy?.userRefId || task.assignedBy?.user?.id;
            if (assignerUserId && currentUserId && assignerUserId !== currentUserId) {
              let memberMatch = await prisma.conversationMember.findFirst({
                where: {
                  userId: currentUserId,
                  conversation: {
                    isGroup: false,
                    members: {
                      some: { userId: assignerUserId },
                    },
                  },
                },
                select: { conversationId: true },
              });

              let conversationId = memberMatch?.conversationId;
              if (!conversationId) {
                const newConvo = await prisma.conversation.create({
                  data: {
                    isGroup: false,
                    members: {
                      create: [
                        { userId: currentUserId },
                        { userId: assignerUserId },
                      ],
                    },
                  },
                });
                conversationId = newConvo.id;
              }

              const formattedMessage = `📋 End-of-Day Task Update\n\nTask: ${task.title} (${task.taskCode})\nStatus: ${isCompleted ? 'Completed' : (update.status || task.status)}\n\nUpdate:\n"${updateNote}"`;

              await prisma.message.create({
                data: {
                  conversationId,
                  senderId: currentUserId,
                  content: formattedMessage,
                },
              });

              await NotificationService.sendNotification({
                userId: assignerUserId,
                type: 'task',
                title: `End-of-Day Task Update: ${task.title}`,
                message: `${req.user?.email || 'Employee'} posted an update for task "${task.title}": ${updateNote}`,
                relatedType: 'Task',
                relatedId: task.id,
              });
            }
          }
        }
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
      const { status, notes, attendanceStatus, correctionReason } = req.body;

      const finalStatus = status || attendanceStatus;
      const finalNotes = notes || correctionReason;

      const updated = await prisma.attendance.update({
        where: { id },
        data: {
          attendanceStatus: finalStatus as AttendanceStatus,
          correctedBy: req.user?.email,
          correctionReason: finalNotes,
        },
        include: { employee: true },
      });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'ATTENDANCE_CORRECTED',
        entityType: 'Attendance',
        entityId: id,
        metadata: { employeeName: updated.employee.name, status: finalStatus, notes: finalNotes },
      });

      return ApiResponse.success(res, updated, 'Attendance record updated by Administrator');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
