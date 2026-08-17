import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

export class CustomerController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const customers = await prisma.customer.findMany({
        include: { assignedEmployee: true },
        orderBy: { createdAt: 'desc' },
      });
      return ApiResponse.success(res, customers, 'Customers fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { companyName, contactPerson, phone, email, city, assignedEmployeeId } = req.body;

      if (!companyName || !contactPerson || !phone) {
        return ApiResponse.error(res, 'Company, contact person, and phone are required', 400);
      }

      const count = await prisma.customer.count();
      const customerCode = `CUST-${300 + count + 1}`;

      const newCust = await prisma.customer.create({
        data: {
          customerCode,
          companyName,
          contactPerson,
          phone,
          email,
          city: city || 'Pune',
          assignedEmployeeId: assignedEmployeeId || (await prisma.employee.findFirst())?.id || '',
        },
        include: { assignedEmployee: true },
      });

      return ApiResponse.success(res, newCust, 'Customer created', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
