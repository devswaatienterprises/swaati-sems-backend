import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { NotificationService } from '../services/notification.service';
import { AuditService } from '../services/audit.service';

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
          { name: { contains: search as string, mode: 'insensitive' } },
          { productCode: { contains: search as string, mode: 'insensitive' } },
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
            { name: { contains: id, mode: 'insensitive' } },
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
      const rawName = req.body.name || req.body.leadName || req.body.contactPerson;
      const rawPhone = req.body.phone || req.body.mobileNumber || req.body.mobile;
      const rawProduct = req.body.productInterested || req.body.product || req.body.interestedProduct;
      const rawEmail = req.body.email;
      const rawCompany = req.body.companyName || req.body.company;
      const rawLocation = req.body.location || req.body.city || req.body.address;
      const rawMessage = req.body.message || req.body.requirement || req.body.notes;
      const rawSource = req.body.source || 'Website';

      const name = typeof rawName === 'string' ? rawName.trim() : '';
      const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
      const product = typeof rawProduct === 'string' ? rawProduct.trim() : 'General Inquiry';
      const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
      const company = typeof rawCompany === 'string' ? rawCompany.trim() : '';
      const location = typeof rawLocation === 'string' ? rawLocation.trim() : '';
      const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
      const source = typeof rawSource === 'string' ? rawSource.trim() : 'Website';

      // 1. Validation
      if (!name || name.length < 2) {
        return ApiResponse.error(res, 'Please provide a valid full name (at least 2 characters)', 400);
      }
      if (!phone || phone.length < 7) {
        return ApiResponse.error(res, 'Please provide a valid contact phone number (at least 7 digits)', 400);
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return ApiResponse.error(res, 'Please provide a valid email address format', 400);
      }

      // 2. Duplicate Submission Protection (within 30 seconds)
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      const existingRecentLead = await prisma.lead.findFirst({
        where: {
          mobileNumber: phone,
          leadName: name,
          createdAt: { gte: thirtySecondsAgo },
        },
      });

      if (existingRecentLead) {
        return ApiResponse.success(
          res,
          { leadCode: existingRecentLead.leadCode },
          'Thank you! Your requirement has already been registered. Our engineering team will contact you shortly.',
          200
        );
      }

      // 3. Unique Lead Code Generation
      const currentYear = new Date().getFullYear();
      const count = await prisma.lead.count();
      let leadCode = `LEAD-WEB-${currentYear}-${String(count + 1).padStart(3, '0')}`;

      // Ensure uniqueness in case of race condition
      const codeCheck = await prisma.lead.findUnique({ where: { leadCode } });
      if (codeCheck) {
        leadCode = `LEAD-WEB-${currentYear}-${String(count + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
      }

      // 4. Assign to Sales Team Member if available
      const salesEmp = await prisma.employee.findFirst({
        where: {
          department: { contains: 'Sales', mode: 'insensitive' },
          active: true,
        },
      });

      // 5. Create Lead Record in Database
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
          source: 'Website',
          leadAddedBy: 'Website Form (Auto)',
          status: 'NEW',
          priority: 'HIGH',
          assignedToId: salesEmp ? salesEmp.id : null,
        },
      });

      // 6. Notify Admins
      await NotificationService.notifyAdmins({
        type: 'lead',
        title: 'New Website Lead Received',
        message: `${name} (${company || 'Individual'}) requested quote for "${product}" [${leadCode}].`,
        relatedType: 'Lead',
        relatedId: newLead.id,
      });

      // 7. Audit Log
      await AuditService.log({
        action: 'WEBSITE_LEAD_RECEIVED',
        entityType: 'Lead',
        entityId: newLead.id,
        newValue: {
          leadCode: newLead.leadCode,
          name,
          company,
          phone,
          product,
          source: 'Website',
        },
        metadata: { source: 'Website Contact Form' },
      });

      return ApiResponse.success(
        res,
        {
          id: newLead.id,
          leadCode: newLead.leadCode,
          leadName: newLead.leadName,
          status: newLead.status,
        },
        'Thank you! Your requirement has been registered with Swaati Enterprises. Our technical engineer will contact you shortly.',
        201
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
