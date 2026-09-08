import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { LeadStatus, Priority, RoleType } from '../types/crm.types';
import { AuditService } from '../services/audit.service';
import { NotificationService } from '../services/notification.service';
import { SequenceService } from '../services/sequence.service';

export class LeadController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const userRole = req.user?.role;
      const employeeId = req.user?.employeeId;

      const whereClause: any = {};
      if (userRole !== RoleType.ADMIN) {
        whereClause.assignedToId = employeeId;
      }

      const leads = await prisma.lead.findMany({
        where: whereClause,
        include: {
          assignedTo: {
            select: { name: true, employeeCode: true, designation: true },
          },
          assignedBy: {
            select: { name: true, employeeCode: true, designation: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return ApiResponse.success(res, leads, 'Leads fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const {
        leadName,
        companyName,
        mobileNumber,
        email,
        location,
        requirement,
        productInterested,
        source,
        priority,
        assignedToId,
        followUpDate,
        notes,
      } = req.body;

      if (!leadName || !mobileNumber || !productInterested) {
        return ApiResponse.error(res, 'Lead name, mobile number, and product interested are required', 400);
      }

      const leadCode = await SequenceService.getNextLeadCode();
      const leadAddedBy = req.user?.email ? req.user.email.split('@')[0] : 'Staff';
      const currentEmpId = req.user?.employeeId;

      const allowedSources = ['call', 'walkin', 'whatsapp', 'email', 'referral', 'other', 'website'];
      const finalSource = allowedSources.includes(source?.toLowerCase()) ? source : 'call';

      let finalAssignedToId = assignedToId;
      if (assignedToId) {
        const targetEmp = await prisma.employee.findFirst({
          where: {
            OR: [
              { id: assignedToId },
              { employeeCode: assignedToId },
              { userId: assignedToId },
            ],
          },
        });
        if (targetEmp) finalAssignedToId = targetEmp.id;
      }

      const lead = await prisma.lead.create({
        data: {
          leadCode,
          leadName,
          companyName,
          mobileNumber,
          email,
          location,
          requirement,
          productInterested,
          source: finalSource,
          leadAddedBy,
          priority: (priority?.toUpperCase() as Priority) || Priority.MEDIUM,
          assignedToId: finalAssignedToId,
          assignedById: currentEmpId,
          followUpDate: followUpDate ? new Date(followUpDate) : null,
          notes,
        },
        include: { assignedTo: { include: { user: true } } },
      });

      // If assigned to an employee, send notification
      if (lead.assignedTo?.userRefId) {
        await NotificationService.sendNotification({
          userId: lead.assignedTo.userRefId,
          type: 'lead_assigned',
          title: 'New Lead Assigned',
          message: `Lead "${leadName}" (${productInterested}) has been assigned to you.`,
          relatedType: 'Lead',
          relatedId: lead.id,
        });
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'LEAD_CREATED',
        entityType: 'Lead',
        entityId: lead.id,
        metadata: { leadName, companyName, productInterested, source: finalSource },
      });

      return ApiResponse.success(res, lead, 'Lead created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const lead = await prisma.lead.update({
        where: { id },
        data: { status: status as LeadStatus },
      });

      return ApiResponse.success(res, lead, 'Lead status updated');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { assignedToId, followUpDate, notes, priority } = req.body;

      let finalAssignedToId = assignedToId;
      if (assignedToId) {
        const targetEmp = await prisma.employee.findFirst({
          where: {
            OR: [
              { id: assignedToId },
              { employeeCode: assignedToId },
              { userId: assignedToId },
            ],
          },
        });
        if (targetEmp) finalAssignedToId = targetEmp.id;
      }

      const lead = await prisma.lead.update({
        where: { id },
        data: {
          assignedToId: finalAssignedToId,
          followUpDate: followUpDate ? new Date(followUpDate) : undefined,
          notes,
          priority: priority ? (priority.toUpperCase() as Priority) : undefined,
        },
        include: { assignedTo: { include: { user: true } } },
      });

      // If newly assigned, notify assignee
      if (assignedToId && lead.assignedTo?.userRefId) {
        await NotificationService.sendNotification({
          userId: lead.assignedTo.userRefId,
          type: 'lead_assigned',
          title: 'Lead Assigned to You',
          message: `Lead "${lead.leadName}" (${lead.productInterested}) is assigned to you.`,
          relatedType: 'Lead',
          relatedId: id,
        });
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'LEAD_UPDATED',
        entityType: 'Lead',
        entityId: id,
        metadata: { leadName: lead.leadName, assignedToId, priority },
      });

      return ApiResponse.success(res, lead, 'Lead updated successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
