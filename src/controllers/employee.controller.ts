import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { RoleType } from '../types/crm.types';
import { AuditService } from '../services/audit.service';
import { R2Service } from '../services/r2.service';

export class EmployeeController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { status, department } = req.query;

      const whereClause: any = {};
      if (status === 'Active') whereClause.active = true;
      if (status === 'Inactive') whereClause.active = false;
      if (department && department !== 'ALL') whereClause.department = department as string;

      const employees = await prisma.employee.findMany({
        where: whereClause,
        include: {
          user: {
            include: { permissions: true },
          },
          documents: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return ApiResponse.success(res, employees, 'Employees fetched successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const employee = await prisma.employee.findFirst({
        where: { OR: [{ id }, { userId: id }] },
        include: {
          user: {
            include: { permissions: true },
          },
          documents: true,
          attendances: { orderBy: { attendanceDate: 'desc' }, take: 15 },
          assignedTasks: { take: 10 },
          leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      });

      if (!employee) {
        return ApiResponse.error(res, 'Employee profile not found', 404);
      }

      return ApiResponse.success(res, employee, 'Employee profile fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const {
        name,
        userId,
        email,
        mobile,
        password,
        role,
        department,
        designation,
        joiningDate,
        reportingManager,
        idCardType,
        idCardNumber,
        frontImagePath,
        backImagePath,
        permissions, // Object: { dashboard: true, ... }
      } = req.body;

      if (!name || !email || !mobile) {
        return ApiResponse.error(res, 'Name, email, and mobile are required', 400);
      }

      const count = await prisma.employee.count();
      const employeeCode = `EMP-${100 + count + 1}`;
      const finalUserId = (userId || email.split('@')[0]).trim().toLowerCase();

      // Check if email or userId exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { userId: finalUserId }],
        },
      });

      if (existingUser) {
        return ApiResponse.error(res, 'A user with this Email or User ID already exists.', 400);
      }

      const passwordHash = await bcrypt.hash(password || 'Employee@123', 10);
      const userRole = role === 'ADMIN' ? RoleType.ADMIN : RoleType.EMPLOYEE;

      // Create linked User and Employee in transaction
      const result = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            userId: finalUserId,
            email: email.trim().toLowerCase(),
            passwordHash,
            role: userRole,
            isActive: true,
          },
        });

        // Set permissions in user_permissions table
        const defaultFeatures = [
          'dashboard',
          'attendance',
          'leave',
          'tasks',
          'leads',
          'products',
          'reports',
          'notifications',
          'messaging',
        ];

        const permInserts = defaultFeatures.map((feat) => ({
          userId: newUser.id,
          featureKey: feat,
          enabled: permissions ? !!permissions[feat] : feat !== 'reports',
          updatedBy: req.user?.email || 'Admin',
        }));

        await tx.userPermission.createMany({ data: permInserts });

        // Create Employee profile
        const newEmployee = await tx.employee.create({
          data: {
            employeeCode,
            userId: finalUserId,
            name,
            email: email.trim().toLowerCase(),
            mobile,
            department: department || 'Technical & Operations',
            designation: designation || 'Site Engineer',
            joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
            reportingManager: reportingManager || 'Shailendra Patil',
            employmentStatus: 'Active',
            active: true,
            avatar: name.split(' ').map((n: string) => n[0]).join('').toUpperCase(),
            userRefId: newUser.id,
          },
        });

        // Store identity document in employee_documents table if provided
        if (idCardType && idCardNumber) {
          await tx.employeeDocument.create({
            data: {
              employeeId: newEmployee.id,
              documentType: idCardType,
              documentNumber: idCardNumber,
              frontImagePath,
              backImagePath,
              uploadedBy: req.user?.email || 'Admin',
            },
          });
        }

        return newEmployee;
      });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'EMPLOYEE_CREATED',
        entityType: 'Employee',
        entityId: result.id,
        metadata: { name: result.name, code: result.employeeCode, userId: result.userId },
      });

      return ApiResponse.success(res, result, 'Employee account created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        mobile,
        department,
        designation,
        reportingManager,
      } = req.body;

      const updated = await prisma.employee.update({
        where: { id },
        data: {
          name,
          mobile,
          department,
          designation,
          reportingManager,
        },
      });

      return ApiResponse.success(res, updated, 'Employee profile updated');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body; // 'Active' | 'Inactive'

      const isActive = status === 'Active';

      const employee = await prisma.employee.update({
        where: { id },
        data: {
          active: isActive,
          employmentStatus: status,
          deactivatedAt: !isActive ? new Date() : null,
          deactivatedBy: !isActive ? (req.user?.email || 'Admin') : null,
        },
        include: { user: true },
      });

      // Also update linked User account active status
      if (employee.userRefId) {
        await prisma.user.update({
          where: { id: employee.userRefId },
          data: { isActive },
        });
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: isActive ? 'EMPLOYEE_REACTIVATED' : 'EMPLOYEE_DEACTIVATED',
        entityType: 'Employee',
        entityId: employee.id,
        metadata: { name: employee.name, status },
      });

      return ApiResponse.success(res, employee, `Employee account is now ${status}`);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updatePermissions(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { permissions } = req.body; // { dashboard: true, ... }

      const employee = await prisma.employee.findUnique({
        where: { id },
        include: { user: true },
      });

      if (!employee || !employee.userRefId) {
        return ApiResponse.error(res, 'User record not linked with this employee', 404);
      }

      const userId = employee.userRefId;

      // Upsert permissions in user_permissions table
      const entries = Object.entries(permissions as Record<string, boolean>);
      for (const [featureKey, enabled] of entries) {
        await prisma.userPermission.upsert({
          where: { userId_featureKey: { userId, featureKey } },
          update: { enabled, updatedBy: req.user?.email || 'Admin' },
          create: { userId, featureKey, enabled, updatedBy: req.user?.email || 'Admin' },
        });
      }

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'PERMISSIONS_UPDATED',
        entityType: 'UserPermission',
        entityId: userId,
        metadata: { employeeName: employee.name, permissions },
      });

      return ApiResponse.success(res, null, 'Employee permissions updated successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async addDocument(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { documentType, documentNumber } = req.body;

      if (!documentType || !documentNumber) {
        return ApiResponse.error(res, 'Document type and number are required', 400);
      }

      let frontImagePath = req.body.frontImagePath || null;
      let backImagePath = req.body.backImagePath || null;

      // Handle multipart files uploaded to Cloudflare R2
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      if (files?.frontImage?.[0]) {
        const file = files.frontImage[0];
        const key = R2Service.generateKey('employees', id, `front-${file.originalname}`);
        await R2Service.upload({
          key,
          buffer: file.buffer,
          mimeType: file.mimetype,
          metadata: { employeeId: id, side: 'front', documentType },
        });
        frontImagePath = key;
      }

      if (files?.backImage?.[0]) {
        const file = files.backImage[0];
        const key = R2Service.generateKey('employees', id, `back-${file.originalname}`);
        await R2Service.upload({
          key,
          buffer: file.buffer,
          mimeType: file.mimetype,
          metadata: { employeeId: id, side: 'back', documentType },
        });
        backImagePath = key;
      }

      const doc = await prisma.employeeDocument.create({
        data: {
          employeeId: id,
          documentType,
          documentNumber,
          frontImagePath,
          backImagePath,
          uploadedBy: req.user?.email || 'Admin',
        },
      });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'EMPLOYEE_KYC_UPLOADED',
        entityType: 'EmployeeDocument',
        entityId: doc.id,
        metadata: { employeeId: id, documentType, documentNumber },
      });

      return ApiResponse.success(res, doc, 'Identity document registered in private R2 storage', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async getKycSignedUrls(req: AuthRequest, res: Response) {
    try {
      const { id, docId } = req.params;

      const doc = await prisma.employeeDocument.findFirst({
        where: { id: docId, employeeId: id },
      });

      if (!doc) {
        return ApiResponse.error(res, 'Employee document not found', 404);
      }

      let frontSignedUrl: string | null = null;
      let backSignedUrl: string | null = null;

      if (doc.frontImagePath) {
        frontSignedUrl = await R2Service.getSignedDownloadUrl(doc.frontImagePath, 1800); // 30 min
      }

      if (doc.backImagePath) {
        backSignedUrl = await R2Service.getSignedDownloadUrl(doc.backImagePath, 1800);
      }

      return ApiResponse.success(
        res,
        {
          id: doc.id,
          documentType: doc.documentType,
          documentNumber: doc.documentNumber,
          frontSignedUrl,
          backSignedUrl,
          expiresInSeconds: 1800,
        },
        'Presigned KYC document URLs generated'
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async deleteDocument(req: AuthRequest, res: Response) {
    try {
      const { id, docId } = req.params;

      const doc = await prisma.employeeDocument.findFirst({
        where: { id: docId, employeeId: id },
      });

      if (!doc) {
        return ApiResponse.error(res, 'Employee document not found', 404);
      }

      // Delete from R2 private storage
      if (doc.frontImagePath) {
        try {
          await R2Service.delete(doc.frontImagePath);
        } catch (e) {
          console.warn('[R2 Storage]: Warning deleting front image from bucket', e);
        }
      }
      if (doc.backImagePath) {
        try {
          await R2Service.delete(doc.backImagePath);
        } catch (e) {
          console.warn('[R2 Storage]: Warning deleting back image from bucket', e);
        }
      }

      await prisma.employeeDocument.delete({ where: { id: docId } });

      return ApiResponse.success(res, null, 'Employee identity document removed from storage');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}

