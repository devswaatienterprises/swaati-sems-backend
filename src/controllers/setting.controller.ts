import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { AuditService } from '../services/audit.service';

export class SettingController {
  static async getAll(req: Request, res: Response) {
    try {
      const settings = await prisma.systemSetting.findMany();
      const settingsMap: Record<string, string> = {
        officeStartTime: '10:00 AM',
        officeEndTime: '06:30 PM',
        workingDays: '26',
        weeklyOffs: '4',
        gracePeriodMinutes: '15',
        companyName: 'Swaati Enterprises',
        companyEmail: 'info@swaatienterprises.in',
        companyPhone: '+91 93700 11133',
      };

      for (const s of settings) {
        settingsMap[s.key] = s.value;
      }

      return ApiResponse.success(res, settingsMap, 'System settings fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { officeStartTime, officeEndTime, gracePeriodMinutes, workingDays, weeklyOffs } = req.body;

      const updates: { key: string; value: string }[] = [];

      if (officeStartTime) updates.push({ key: 'officeStartTime', value: officeStartTime });
      if (officeEndTime) updates.push({ key: 'officeEndTime', value: officeEndTime });
      if (gracePeriodMinutes !== undefined) updates.push({ key: 'gracePeriodMinutes', value: gracePeriodMinutes.toString() });
      if (workingDays !== undefined) updates.push({ key: 'workingDays', value: workingDays.toString() });
      if (weeklyOffs !== undefined) updates.push({ key: 'weeklyOffs', value: weeklyOffs.toString() });

      for (const item of updates) {
        await prisma.systemSetting.upsert({
          where: { key: item.key },
          update: { value: item.value },
          create: { key: item.key, value: item.value },
        });
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'SETTINGS_UPDATED',
        entityType: 'SystemSetting',
        metadata: { updates },
      });

      return ApiResponse.success(res, null, 'Settings saved successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
