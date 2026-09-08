import { prisma } from '../config/db';
import { SequenceService } from './sequence.service';
import { NotificationService } from './notification.service';
import { Priority, TaskStatus } from '../types/crm.types';

/**
 * Returns a normalized UTC Date representing midnight (00:00:00.000) of the IST calendar day.
 */
export function getISTDateMidnight(date: Date = new Date()): Date {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffset);
  const year = istTime.getUTCFullYear();
  const month = istTime.getUTCMonth();
  const day = istTime.getUTCDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * Returns the 1-7 ISO weekday in IST (1 = Monday, ..., 7 = Sunday).
 */
export function getISTDayOfWeek(date: Date = new Date()): number {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffset);
  const day = istTime.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  return day === 0 ? 7 : day;
}

/**
 * Returns the day of month in IST (1..31).
 */
export function getISTDayOfMonth(date: Date = new Date()): number {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffset);
  return istTime.getUTCDate();
}

/**
 * Builds deadline datetime given IST midnight date and dueTime string (e.g. "18:00" or "06:00 PM").
 */
export function buildDeadlineWithDueTime(midnightDate: Date, dueTime?: string | null): Date {
  if (!dueTime) {
    // Default end of day: 18:30 (6:30 PM IST)
    return new Date(midnightDate.getTime() + (18.5 * 60 * 60 * 1000) - (5.5 * 60 * 60 * 1000));
  }

  let hours = 18;
  let minutes = 30;

  const trimmed = dueTime.trim();
  const match12 = trimmed.match(/(\d+):(\d+)\s*(AM|PM)/i);
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);

  if (match12) {
    hours = parseInt(match12[1], 10);
    minutes = parseInt(match12[2], 10);
    const meridiem = match12[3].toUpperCase();
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else if (match24) {
    hours = parseInt(match24[1], 10);
    minutes = parseInt(match24[2], 10);
  }

  // Convert IST (UTC+5:30) hours/minutes to UTC epoch
  const totalMinutesFromMidnight = (hours * 60 + minutes) - 330;
  return new Date(midnightDate.getTime() + totalMinutesFromMidnight * 60 * 1000);
}

export class RecurringTaskService {
  /**
   * Checks whether a recurring task schedule matches the given occurrence date.
   */
  static isScheduleMatching(
    rec: {
      frequency: string;
      daysOfWeek: number[];
      dayOfMonth?: number | null;
      workingDaysOnly: boolean;
      startDate: Date;
      endDate?: Date | null;
    },
    occurrenceDate: Date
  ): boolean {
    const occMidnight = getISTDateMidnight(occurrenceDate);
    const startMidnight = getISTDateMidnight(rec.startDate);

    // Cannot occur before start date
    if (occMidnight.getTime() < startMidnight.getTime()) {
      return false;
    }

    // Cannot occur after end date if defined
    if (rec.endDate) {
      const endMidnight = getISTDateMidnight(rec.endDate);
      if (occMidnight.getTime() > endMidnight.getTime()) {
        return false;
      }
    }

    const dayOfWeek = getISTDayOfWeek(occurrenceDate); // 1 = Mon ... 7 = Sun
    const dayOfMonth = getISTDayOfMonth(occurrenceDate); // 1..31

    // If workingDaysOnly is true, skip Sunday (day 7)
    if (rec.workingDaysOnly && dayOfWeek === 7) {
      return false;
    }

    const freq = (rec.frequency || 'DAILY').toUpperCase();

    switch (freq) {
      case 'DAILY':
        return true;

      case 'WEEKLY': {
        const allowedDays = rec.daysOfWeek && rec.daysOfWeek.length > 0
          ? rec.daysOfWeek
          : [getISTDayOfWeek(rec.startDate)];
        return allowedDays.includes(dayOfWeek);
      }

      case 'MONTHLY': {
        const targetDay = rec.dayOfMonth || getISTDayOfMonth(rec.startDate);
        return dayOfMonth === targetDay;
      }

      default:
        return false;
    }
  }

  /**
   * Generates all due recurring tasks for a target date (defaults to today in IST).
   * Safe against duplicates at the database level.
   */
  static async generateDueTasks(targetDate: Date = new Date()): Promise<{ generatedCount: number; tasks: any[] }> {
    const occurrenceDate = getISTDateMidnight(targetDate);

    // 1. Fetch active recurring task templates
    const templates = await prisma.recurringTask.findMany({
      where: {
        active: true,
      },
      include: {
        assignedTo: {
          include: { user: true },
        },
        assignedBy: true,
      },
    });

    const generatedTasks: any[] = [];

    for (const tpl of templates) {
      // 2. Validate Assignee is active
      if (!tpl.assignedTo || !tpl.assignedTo.active) {
        continue;
      }
      if (tpl.assignedTo.user && !tpl.assignedTo.user.isActive) {
        continue;
      }

      // 3. Check schedule matching
      const isEligible = this.isScheduleMatching(tpl, targetDate);
      if (!isEligible) {
        continue;
      }

      // 4. Concurrency-safe atomic check & creation
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Check if occurrence already exists
          const existingOccurrence = await tx.recurringTaskOccurrence.findUnique({
            where: {
              recurringTaskId_occurrenceDate: {
                recurringTaskId: tpl.id,
                occurrenceDate,
              },
            },
          });

          if (existingOccurrence) {
            return null; // Already generated
          }

          // Generate next sequential task code
          const taskCode = await SequenceService.getNextTaskCode();
          const deadline = buildDeadlineWithDueTime(occurrenceDate, tpl.dueTime);

          // Create standard Task
          const task = await tx.task.create({
            data: {
              taskCode,
              title: tpl.title,
              description: tpl.description,
              priority: (tpl.priority?.toUpperCase() as Priority) || Priority.MEDIUM,
              status: TaskStatus.TODO,
              category: 'Recurring SOP',
              startDate: occurrenceDate,
              deadline,
              reminderTime: tpl.dueTime,
              assignedToId: tpl.assignedToId,
              assignedById: tpl.assignedById,
              recurringTaskId: tpl.id,
            },
            include: {
              assignedTo: { include: { user: true } },
              assignedBy: true,
              recurringTask: true,
            },
          });

          // Record occurrence record for uniqueness guarantee
          await tx.recurringTaskOccurrence.create({
            data: {
              recurringTaskId: tpl.id,
              occurrenceDate,
              taskId: task.id,
            },
          });

          // Record initial assignment history
          await tx.taskAssignmentHistory.create({
            data: {
              taskId: task.id,
              previousAssigneeId: null,
              newAssigneeId: tpl.assignedToId,
              changedBy: 'System (Recurring SOP)',
            },
          });

          return task;
        });

        if (result) {
          generatedTasks.push(result);

          // Notify Assignee
          if (result.assignedTo?.userRefId) {
            await NotificationService.sendNotification({
              userId: result.assignedTo.userRefId,
              type: 'task_assigned',
              title: 'Daily SOP Assigned',
              message: `"${result.title}" scheduled for today has been added to your tasks.`,
              relatedType: 'Task',
              relatedId: result.id,
            }).catch((err) => console.warn('[RecurringTask Notification Warning]:', err.message));
          }
        }
      } catch (err: any) {
        // Unique constraint error P2002 means another process generated it concurrently
        if (err.code === 'P2002') {
          console.log(`[RecurringTask] Occurrence for template ${tpl.recurringCode} already generated concurrently.`);
        } else {
          console.error(`[RecurringTask] Error generating task for ${tpl.recurringCode}:`, err);
        }
      }
    }

    return {
      generatedCount: generatedTasks.length,
      tasks: generatedTasks,
    };
  }

  /**
   * Generates today's occurrence immediately for a specific recurring task if due.
   */
  static async generateForTemplate(templateId: string, targetDate: Date = new Date()): Promise<any | null> {
    const tpl = await prisma.recurringTask.findUnique({
      where: { id: templateId },
      include: {
        assignedTo: { include: { user: true } },
        assignedBy: true,
      },
    });

    if (!tpl || !tpl.active || !tpl.assignedTo || !tpl.assignedTo.active) {
      return null;
    }

    if (tpl.assignedTo.user && !tpl.assignedTo.user.isActive) {
      return null;
    }

    const isEligible = this.isScheduleMatching(tpl, targetDate);
    if (!isEligible) {
      return null;
    }

    const occurrenceDate = getISTDateMidnight(targetDate);

    try {
      return await prisma.$transaction(async (tx) => {
        const existingOccurrence = await tx.recurringTaskOccurrence.findUnique({
          where: {
            recurringTaskId_occurrenceDate: {
              recurringTaskId: tpl.id,
              occurrenceDate,
            },
          },
        });

        if (existingOccurrence) {
          return null;
        }

        const taskCode = await SequenceService.getNextTaskCode();
        const deadline = buildDeadlineWithDueTime(occurrenceDate, tpl.dueTime);

        const task = await tx.task.create({
          data: {
            taskCode,
            title: tpl.title,
            description: tpl.description,
            priority: (tpl.priority?.toUpperCase() as Priority) || Priority.MEDIUM,
            status: TaskStatus.TODO,
            category: 'Recurring SOP',
            startDate: occurrenceDate,
            deadline,
            reminderTime: tpl.dueTime,
            assignedToId: tpl.assignedToId,
            assignedById: tpl.assignedById,
            recurringTaskId: tpl.id,
          },
          include: {
            assignedTo: { include: { user: true } },
            assignedBy: true,
            recurringTask: true,
          },
        });

        await tx.recurringTaskOccurrence.create({
          data: {
            recurringTaskId: tpl.id,
            occurrenceDate,
            taskId: task.id,
          },
        });

        await tx.taskAssignmentHistory.create({
          data: {
            taskId: task.id,
            previousAssigneeId: null,
            newAssigneeId: tpl.assignedToId,
            changedBy: 'System (Recurring SOP)',
          },
        });

        return task;
      });
    } catch (err: any) {
      if (err.code === 'P2002') return null;
      throw err;
    }
  }
}
