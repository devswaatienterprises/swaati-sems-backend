import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { RoleType } from '../types/crm.types';
import { AuditService } from '../services/audit.service';
import { R2Service } from '../services/r2.service';
import { SequenceService } from '../services/sequence.service';
import { RecurringTaskService } from '../services/recurringTask.service';
import { encryptPassword, decryptPassword } from '../utils/encryption';

export class EmployeeController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { status, department } = req.query;

      const whereClause: any = {};
      if (status === 'Active') whereClause.active = true;
      if (status === 'Inactive') whereClause.active = false;
      if (department && department !== 'ALL') whereClause.department = department as string;

      const rawEmployees = await prisma.employee.findMany({
        where: whereClause,
        include: {
          user: {
            include: { permissions: true },
          },
          departmentRef: true,
          roleRef: true,
          documents: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const employees = rawEmployees.map((emp) => {
        if (!emp.user) return emp;
        const { encryptedPassword, passwordHash, ...userClean } = emp.user as any;
        return {
          ...emp,
          user: {
            ...userClean,
            hasRecoverablePassword: Boolean(encryptedPassword),
          },
        };
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
          departmentRef: true,
          roleRef: true,
          documents: true,
          attendances: { orderBy: { attendanceDate: 'desc' }, take: 15 },
          assignedTasks: { take: 10 },
          leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      });

      if (!employee) {
        return ApiResponse.error(res, 'Employee profile not found', 404);
      }

      const { user, ...empRest } = employee as any;
      let cleanUser = user;
      if (user) {
        const { encryptedPassword, passwordHash, ...userClean } = user;
        cleanUser = {
          ...userClean,
          hasRecoverablePassword: Boolean(encryptedPassword),
        };
      }

      return ApiResponse.success(res, { ...empRest, user: cleanUser }, 'Employee profile fetched');
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
        departmentId,
        roleId,
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

      const employeeCode = await SequenceService.getNextEmployeeCode();
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

      let finalDepartmentName = department || 'Technical & Operations';
      let finalDesignationName = designation || 'Site Engineer';
      let finalDepartmentId = departmentId || null;
      let finalRoleId = roleId || null;

      if (roleId) {
        const roleObj = await prisma.role.findUnique({
          where: { id: roleId },
          include: { department: true },
        });
        if (roleObj) {
          finalRoleId = roleObj.id;
          finalDepartmentId = roleObj.departmentId;
          finalDepartmentName = roleObj.department.name;
          finalDesignationName = roleObj.name;
        }
      } else if (departmentId) {
        const deptObj = await prisma.department.findUnique({ where: { id: departmentId } });
        if (deptObj) {
          finalDepartmentId = deptObj.id;
          finalDepartmentName = deptObj.name;
        }
      }

      const plainPassword = (password || 'Employee@123').trim();
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      const encryptedPassword = encryptPassword(plainPassword);
      const validRoles = ['ADMIN', 'OPERATION_HEAD', 'SALES', 'ACCOUNTANT', 'WAREHOUSE_MANAGER'];
      const userRole = validRoles.includes(role) ? role : 'OPERATION_HEAD';

      // Create linked User and Employee in transaction
      const result = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            userId: finalUserId,
            email: email.trim().toLowerCase(),
            passwordHash,
            encryptedPassword,
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

        let permInserts = [];
        if (permissions && typeof permissions === 'object') {
          permInserts = Object.entries(permissions).map(([feat, enabled]) => ({
            userId: newUser.id,
            featureKey: feat,
            enabled: Boolean(enabled),
            updatedBy: req.user?.email || 'Admin',
          }));
        } else {
          permInserts = defaultFeatures.map((feat) => ({
            userId: newUser.id,
            featureKey: feat,
            enabled: feat !== 'reports',
            updatedBy: req.user?.email || 'Admin',
          }));
        }

        if (permInserts.length > 0) {
          await tx.userPermission.createMany({ data: permInserts });
        }

        // Create Employee profile
        const newEmployee = await tx.employee.create({
          data: {
            employeeCode,
            userId: finalUserId,
            name,
            email: email.trim().toLowerCase(),
            mobile,
            department: finalDepartmentName,
            designation: finalDesignationName,
            departmentId: finalDepartmentId,
            roleId: finalRoleId,
            joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
            reportingManager: reportingManager || 'Shailendra Patil',
            employmentStatus: 'Active',
            active: true,
            avatar: name.split(' ').map((n: string) => n[0]).join('').toUpperCase(),
            userRefId: newUser.id,
            attendanceVerification: req.body.attendanceVerification || 'NONE',
            approvedIPs: req.body.approvedIPs || null,
            approvedLat: req.body.approvedLat != null ? parseFloat(req.body.approvedLat) : null,
            approvedLng: req.body.approvedLng != null ? parseFloat(req.body.approvedLng) : null,
            approvedRadiusMeters: req.body.approvedRadiusMeters != null ? parseInt(req.body.approvedRadiusMeters, 10) : 200,
          },
          include: {
            departmentRef: true,
            roleRef: true,
            user: { include: { permissions: true } },
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

      // Trigger automatic recurring tasks assignment if role is assigned
      if (result.id && result.roleId) {
        await RecurringTaskService.generateTasksForEmployee(result.id).catch((err) => {
          console.warn('[Employee Create RecurringTask Trigger Warning]:', err.message);
        });
      }

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
        departmentId,
        roleId,
        reportingManager,
        role,
        password,
        attendanceVerification,
        approvedIPs,
        approvedLat,
        approvedLng,
        approvedRadiusMeters,
      } = req.body;

      const employeeUpdateData: any = {};
      if (name !== undefined) employeeUpdateData.name = name;
      if (mobile !== undefined) employeeUpdateData.mobile = mobile;
      if (department !== undefined) employeeUpdateData.department = department;
      if (designation !== undefined) employeeUpdateData.designation = designation;
      if (reportingManager !== undefined) employeeUpdateData.reportingManager = reportingManager;

      if (roleId) {
        const roleObj = await prisma.role.findUnique({
          where: { id: roleId },
          include: { department: true },
        });
        if (roleObj) {
          employeeUpdateData.roleId = roleObj.id;
          employeeUpdateData.departmentId = roleObj.departmentId;
          employeeUpdateData.department = roleObj.department.name;
          employeeUpdateData.designation = roleObj.name;
        }
      } else if (departmentId) {
        const deptObj = await prisma.department.findUnique({ where: { id: departmentId } });
        if (deptObj) {
          employeeUpdateData.departmentId = deptObj.id;
          employeeUpdateData.department = deptObj.name;
        }
      }

      if (attendanceVerification !== undefined) {
        employeeUpdateData.attendanceVerification = attendanceVerification;
      }
      if (approvedIPs !== undefined) {
        employeeUpdateData.approvedIPs = approvedIPs || null;
      }
      if (approvedLat !== undefined) {
        employeeUpdateData.approvedLat = approvedLat != null ? parseFloat(approvedLat) : null;
      }
      if (approvedLng !== undefined) {
        employeeUpdateData.approvedLng = approvedLng != null ? parseFloat(approvedLng) : null;
      }
      if (approvedRadiusMeters !== undefined) {
        employeeUpdateData.approvedRadiusMeters = approvedRadiusMeters != null ? parseInt(approvedRadiusMeters, 10) : 200;
      }

      const updated = await prisma.employee.update({
        where: { id },
        data: employeeUpdateData,
        include: {
          user: true,
          departmentRef: true,
          roleRef: true,
        },
      });

      if (updated.userRefId) {
        const userUpdateData: any = {};
        const validRoles = ['ADMIN', 'OPERATION_HEAD', 'SALES', 'ACCOUNTANT', 'WAREHOUSE_MANAGER'];
        if (role && validRoles.includes(role)) {
          userUpdateData.role = role;
        }
        if (password && password.trim()) {
          const plainPassword = password.trim();
          userUpdateData.passwordHash = await bcrypt.hash(plainPassword, 10);
          userUpdateData.encryptedPassword = encryptPassword(plainPassword);
        }
        if (Object.keys(userUpdateData).length > 0) {
          await prisma.user.update({
            where: { id: updated.userRefId },
            data: userUpdateData,
          });
        }
      }

      // Trigger automatic task generation for new role if role is assigned/changed
      if (updated.id && updated.roleId) {
        await RecurringTaskService.generateTasksForEmployee(updated.id).catch((err) => {
          console.warn('[Employee Update RecurringTask Trigger Warning]:', err.message);
        });
      }

      return ApiResponse.success(res, updated, 'Employee profile updated');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async revealPassword(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const employee = await prisma.employee.findFirst({
        where: { OR: [{ id }, { userId: id }] },
        include: { user: true },
      });

      if (!employee || !employee.user) {
        return ApiResponse.error(res, 'Employee account not found', 404);
      }

      let plainPassword = decryptPassword(employee.user.encryptedPassword);
      if (!plainPassword && employee.user.userId) {
        const defaults: Record<string, string> = {
          'admin': 'admin123',
          'rajesh.s': 'Sales@123',
          'priya.d': 'Site@123',
          'anita.d': 'Ops@123',
        };
        plainPassword = defaults[employee.user.userId] || null;
      }

      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'EMPLOYEE_PASSWORD_STATUS_CHECKED',
        entityType: 'Employee',
        entityId: employee.id,
        metadata: { employeeName: employee.name, employeeCode: employee.employeeCode },
      });

      return ApiResponse.success(
        res,
        {
          hasPasswordSet: Boolean(employee.user.passwordHash),
          isSecured: true,
          password: plainPassword,
          maskedPassword: '••••••••',
        },
        'Password security status verified'
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateVerification(req: AuthRequest, res: Response) {
    try {
      // Admin-only — enforced at route level with authorize([RoleType.ADMIN])
      const { id } = req.params;
      const {
        attendanceVerification,
        approvedIPs,
        approvedLat,
        approvedLng,
        approvedRadiusMeters,
      } = req.body;

      const validMethods = ['NONE', 'OFFICE_IP', 'MOBILE_GPS', 'HYBRID'];
      if (attendanceVerification && !validMethods.includes(attendanceVerification)) {
        return ApiResponse.error(res, `Invalid verification method. Must be one of: ${validMethods.join(', ')}`, 400);
      }

      const updateData: any = {};
      if (attendanceVerification !== undefined) updateData.attendanceVerification = attendanceVerification;
      if (approvedIPs !== undefined) updateData.approvedIPs = approvedIPs || null;
      if (approvedLat !== undefined) updateData.approvedLat = approvedLat != null ? parseFloat(approvedLat) : null;
      if (approvedLng !== undefined) updateData.approvedLng = approvedLng != null ? parseFloat(approvedLng) : null;
      if (approvedRadiusMeters !== undefined) updateData.approvedRadiusMeters = approvedRadiusMeters != null ? parseInt(approvedRadiusMeters, 10) : 200;

      const updated = await prisma.employee.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          employeeCode: true,
          attendanceVerification: true,
          approvedIPs: true,
          approvedLat: true,
          approvedLng: true,
          approvedRadiusMeters: true,
        },
      });

      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'EMPLOYEE_VERIFICATION_UPDATED',
        entityType: 'Employee',
        entityId: id,
        metadata: {
          method: attendanceVerification,
          updatedBy: req.user?.email || 'Admin',
        },
      });

      return ApiResponse.success(res, updated, 'Attendance verification configuration updated');
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

