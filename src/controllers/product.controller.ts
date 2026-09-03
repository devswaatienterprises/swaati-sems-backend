import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { AuditService } from '../services/audit.service';

export class ProductController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const products = await prisma.product.findMany({
        include: {
          documents: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { name: 'asc' },
      });
      return ApiResponse.success(res, products, 'Products and datasheets fetched');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, category, brand, productType, subcategory } = req.body;

      if (!name || !category || !brand) {
        return ApiResponse.error(res, 'Name, category, and brand are required', 400);
      }

      const count = await prisma.product.count();
      const productCode = `PROD-${category.slice(0, 2).toUpperCase()}-${100 + count + 1}`;

      const product = await prisma.product.create({
        data: {
          productCode,
          name,
          category,
          brand,
          productType,
          subcategory,
          status: 'Active',
        },
      });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'PRODUCT_CREATED',
        entityType: 'Product',
        entityId: product.id,
        metadata: { name: product.name, code: product.productCode },
      });

      return ApiResponse.success(res, product, 'Product added to library', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async uploadDocument(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, documentType, fileName, fileSize, version, fileUrl, storagePath } = req.body;

      if (!fileName || !fileUrl) {
        return ApiResponse.error(res, 'File name and file URL are required', 400);
      }

      const document = await prisma.productDocument.create({
        data: {
          productId: id,
          title: title || 'Technical Datasheet (TDS)',
          documentType: documentType || 'datasheet',
          fileName,
          storagePath,
          fileSize: fileSize || '1.0 MB',
          version: version || 'v1.0',
          uploadedBy: req.user?.email || 'Admin',
          fileUrl,
          isActive: true,
        },
      });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'ProductDocument',
        entityId: document.id,
        metadata: { productId: id, fileName, version: document.version },
      });

      return ApiResponse.success(res, document, 'Document uploaded successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async replaceDocument(req: AuthRequest, res: Response) {
    try {
      const { docId } = req.params;
      const { title, fileName, fileSize, version, fileUrl, storagePath } = req.body;

      const existingDoc = await prisma.productDocument.findUnique({
        where: { id: docId },
      });

      if (!existingDoc) {
        return ApiResponse.error(res, 'Target document to replace was not found', 404);
      }

      // Archive previous version
      await prisma.productDocument.update({
        where: { id: docId },
        data: {
          isActive: false,
          replacedAt: new Date(),
        },
      });

      // Create new active version
      const newVersionDoc = await prisma.productDocument.create({
        data: {
          productId: existingDoc.productId,
          title: title || existingDoc.title,
          documentType: existingDoc.documentType,
          fileName: fileName || existingDoc.fileName,
          storagePath,
          fileSize: fileSize || existingDoc.fileSize,
          version: version || 'v2.0',
          uploadedBy: req.user?.email || 'Admin',
          fileUrl: fileUrl || existingDoc.fileUrl,
          isActive: true,
        },
      });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'DOCUMENT_REPLACED',
        entityType: 'ProductDocument',
        entityId: newVersionDoc.id,
        metadata: {
          previousDocId: docId,
          previousVersion: existingDoc.version,
          newVersion: newVersionDoc.version,
          fileName: newVersionDoc.fileName,
        },
      });

      return ApiResponse.success(
        res,
        newVersionDoc,
        `Datasheet replaced and upgraded to ${newVersionDoc.version}. Website sync active.`
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async deleteDocument(req: AuthRequest, res: Response) {
    try {
      const { docId } = req.params;

      const doc = await prisma.productDocument.findUnique({ where: { id: docId } });
      if (!doc) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      await prisma.productDocument.delete({ where: { id: docId } });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'DOCUMENT_DELETED',
        entityType: 'ProductDocument',
        entityId: docId,
        metadata: { fileName: doc.fileName },
      });

      return ApiResponse.success(res, null, 'Document removed from library');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
