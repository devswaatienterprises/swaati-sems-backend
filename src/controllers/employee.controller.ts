import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

export class EmployeeController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const employees = await prisma.employee.findMany({
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
      const employee = await prisma.employee.findUnique({
        where: { id },
        include: {
          assignedTasks: true,
          assignedLeads: true,
          attendances: true,
        },
      });

      if (!employee) {
        return ApiResponse.error(res, 'Employee not found', 404);
      }

      return ApiResponse.success(res, employee, 'Employee profile fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, email, mobile, department, designation, role, joiningDate } = req.body;

      if (!name || !email || !mobile) {
        return ApiResponse.error(res, 'Name, email, and mobile are required', 400);
      }

      const count = await prisma.employee.count();
      const employeeCode = `EMP-${100 + count + 1}`;

      const newEmployee = await prisma.employee.create({
        data: {
          employeeCode,
          name,
          email,
          mobile,
          department: department || 'Technical & Operations',
          designation: designation || 'Site Engineer',
          joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
          avatar: name.split(' ').map((n: string) => n[0]).join('').toUpperCase(),
        },
      });

      return ApiResponse.success(res, newEmployee, 'Employee created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updated = await prisma.employee.update({
        where: { id },
        data: { status },
      });

      return ApiResponse.success(res, updated, 'Employee status updated');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
