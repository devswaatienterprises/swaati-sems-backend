import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { NotificationService } from '../services/notification.service';

export class PublicController {
  static async getProducts(req: Request, res: Response) {
    try {
      const { category, brand, search } = req.query;

      const whereClause: any = { status: 'Active' };
      if (category && category !== 'All') {
        whereClause.category = category as string;
      }
      if (brand && brand !== 'All') {
        whereClause.brand = brand as string;
      }
      if (search) {
        whereClause.OR = [
          { name: { contains: search as string } },
          { productCode: { contains: search as string } },
        ];
      }

      const products = await prisma.product.findMany({
        where: whereClause,
        include: {
          documents: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { name: 'asc' },
      });

      const formatted = products.map((p: any) => ({
        id: p.id,
        productCode: p.productCode,
        name: p.name,
        category: p.category,
        brand: p.brand,
        productType: p.productType,
        subcategory: p.subcategory,
        activeDatasheet: p.documents?.[0]
          ? {
              id: p.documents[0].id,
              title: p.documents[0].title,
              fileName: p.documents[0].fileName,
              fileUrl: p.documents[0].fileUrl,
              version: p.documents[0].version,
              fileSize: p.documents[0].fileSize,
            }
          : p.datasheetUrl
          ? {
              id: 'legacy',
              title: 'Technical Datasheet',
              fileName: p.datasheetUrl,
              fileUrl: `/datasheets/${p.datasheetUrl}`,
              version: 'v1.0',
              fileSize: '1.2 MB',
            }
          : null,
      }));

      return ApiResponse.success(res, formatted, 'Published products retrieved');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async getProductDatasheet(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const product = await prisma.product.findFirst({
        where: {
          OR: [
            { id },
            { productCode: id },
            { name: { contains: id } },
          ],
        },
        include: {
          documents: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!product) {
        return ApiResponse.error(res, 'Product not found', 404);
      }

      const anyProd = product as any;

      if (!anyProd.documents || anyProd.documents.length === 0) {
        // Fallback to legacy datasheetUrl if available
        if (anyProd.datasheetUrl) {
          return ApiResponse.success(
            res,
            {
              id: 'legacy',
              title: `${anyProd.name} Technical Datasheet`,
              documentType: 'datasheet',
              fileName: anyProd.datasheetUrl,
              version: 'v1.0',
              fileUrl: `/datasheets/${anyProd.datasheetUrl}`,
              fileSize: '1.2 MB',
            },
            'Active datasheet retrieved'
          );
        }
        return ApiResponse.error(res, 'No active datasheet found for this product', 404);
      }

      const latestDoc = anyProd.documents[0];
      return ApiResponse.success(
        res,
        {
          id: latestDoc.id,
          title: latestDoc.title,
          documentType: latestDoc.documentType,
          fileName: latestDoc.fileName,
          version: latestDoc.version,
          fileUrl: latestDoc.fileUrl,
          fileSize: latestDoc.fileSize,
        },
        'Active datasheet retrieved'
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async submitWebsiteLead(req: Request, res: Response) {
    try {
      const {
        name,
        company,
        phone,
        email,
        location,
        product,
        message,
        source = 'website',
      } = req.body;

      if (!name || !phone || !product) {
        return ApiResponse.error(res, 'Name, phone number, and interested product are required', 400);
      }

      const count = await prisma.lead.count();
      const leadCode = `LEAD-WEB-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

      // Assign to Sales Manager if available
      const salesEmp = await prisma.employee.findFirst({
        where: { department: { contains: 'Sales' }, active: true },
      });

      const newLead = await prisma.lead.create({
        data: {
          leadCode,
          leadName: name,
          companyName: company || null,
          mobileNumber: phone,
          email: email || null,
          location: location || null,
          requirement: message || null,
          productInterested: product,
          source,
          leadAddedBy: 'Website Form (Auto)',
          status: 'NEW',
          priority: 'HIGH',
          assignedToId: salesEmp ? salesEmp.id : null,
        },
      });

      // Send System Notification to Admin & Sales
      await NotificationService.notifyAdmins({
        type: 'website_lead',
        title: 'New Website Lead Received',
        message: `${name} (${company || 'Individual'}) inquired about "${product}".`,
        relatedType: 'Lead',
        relatedId: newLead.id,
      });

      return ApiResponse.success(
        res,
        { leadCode: newLead.leadCode },
        'Thank you! Your inquiry has been received. Our engineering team will contact you shortly.',
        201
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
