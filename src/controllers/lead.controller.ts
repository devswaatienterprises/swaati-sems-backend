import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { LeadStatus } from '@prisma/client';

export class LeadController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      let leads;

      if (user?.role === 'EMPLOYEE' && user.employeeId) {
        leads = await prisma.lead.findMany({
          where: { assignedToId: user.employeeId },
          include: { assignedTo: true },
          orderBy: { createdAt: 'desc' },
        });
      } else {
        leads = await prisma.lead.findMany({
          include: { assignedTo: true },
          orderBy: { createdAt: 'desc' },
        });
      }

      return ApiResponse.success(res, leads, 'Leads fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const {
        customerCompany,
        contactPerson,
        phone,
        email,
        productInterested,
        requirement,
        source,
        estimatedValue,
        assignedToId,
        followUpDate,
      } = req.body;

      if (!customerCompany || !contactPerson || !phone || !assignedToId) {
        return ApiResponse.error(res, 'Company, contact person, phone, and assignee are required', 400);
      }

      const count = await prisma.lead.count();
      const leadCode = `LEAD-2026-${String(count + 1).padStart(3, '0')}`;

      const newLead = await prisma.lead.create({
        data: {
          leadCode,
          customerCompany,
          contactPerson,
          phone,
          email,
          productInterested: productInterested || 'Waterproofing Systems',
          requirement,
          source: source || 'Website Enquiry',
          estimatedValue: parseFloat(estimatedValue) || 0,
          status: LeadStatus.NEW,
          assignedToId,
          followUpDate: followUpDate ? new Date(followUpDate) : new Date(Date.now() + 86400000 * 2),
        },
        include: { assignedTo: true },
      });

      return ApiResponse.success(res, newLead, 'Lead created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updated = await prisma.lead.update({
        where: { id },
        data: { status: status as LeadStatus },
        include: { assignedTo: true },
      });

      return ApiResponse.success(res, updated, 'Lead status updated');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
