import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

export class ProductController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const products = await prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return ApiResponse.success(res, products, 'Products fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
