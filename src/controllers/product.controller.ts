import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { AuditService } from '../services/audit.service';
import { R2Service } from '../services/r2.service';

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
      const { title, documentType, version } = req.body;

      let fileName = req.body.fileName;
      let fileSize = req.body.fileSize || '1.0 MB';
      let fileUrl = req.body.fileUrl;
      let storagePath = req.body.storagePath || null;
      let mimeType = req.body.mimeType || null;

      // Handle multipart file upload to Cloudflare R2
      if (req.file) {
        fileName = req.file.originalname;
        mimeType = req.file.mimetype;
        fileSize = `${(req.file.size / (1024 * 1024)).toFixed(2)} MB`;

        const key = R2Service.generateKey('products', id, fileName);
        await R2Service.upload({
          key,
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          metadata: { productId: id, title: title || 'Technical Datasheet' },
        });

        storagePath = key;
        fileUrl = `/api/v1/products/${id}/documents/r2/${encodeURIComponent(key)}`;
      }

      if (!fileName || (!fileUrl && !storagePath)) {
        return ApiResponse.error(res, 'File name and file content/URL are required', 400);
      }

      const document = await prisma.productDocument.create({
        data: {
          productId: id,
          title: title || 'Technical Datasheet (TDS)',
          documentType: documentType || 'datasheet',
          fileName,
          storagePath,
          fileSize,
          mimeType,
          version: version || 'v1.0',
          uploadedBy: req.user?.email || 'Admin',
          fileUrl: fileUrl || `/api/v1/products/${id}/documents/r2/${encodeURIComponent(storagePath || '')}`,
          isActive: true,
        },
      });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'ProductDocument',
        entityId: document.id,
        metadata: { productId: id, fileName, version: document.version, storagePath },
      });

      return ApiResponse.success(res, document, 'Document uploaded to R2 storage successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async getDocumentSignedUrl(req: AuthRequest, res: Response) {
    try {
      const { docId } = req.params;

      const document = await prisma.productDocument.findUnique({
        where: { id: docId },
      });

      if (!document) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      if (!document.storagePath) {
        // Return existing legacy fileUrl if not in R2
        return ApiResponse.success(
          res,
          { url: document.fileUrl, fileName: document.fileName, isDirect: true },
          'Document URL retrieved'
        );
      }

      // Generate 1-hour presigned download URL from Cloudflare R2
      const signedUrl = await R2Service.getSignedDownloadUrl(document.storagePath, 3600);

      return ApiResponse.success(
        res,
        {
          signedUrl,
          fileName: document.fileName,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
          expiresInSeconds: 3600,
        },
        'Presigned R2 download URL generated'
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async replaceDocument(req: AuthRequest, res: Response) {
    try {
      const { docId } = req.params;
      const { title, version } = req.body;

      const existingDoc = await prisma.productDocument.findUnique({
        where: { id: docId },
      });

      if (!existingDoc) {
        return ApiResponse.error(res, 'Target document to replace was not found', 404);
      }

      let fileName = req.body.fileName || existingDoc.fileName;
      let fileSize = req.body.fileSize || existingDoc.fileSize;
      let fileUrl = req.body.fileUrl || existingDoc.fileUrl;
      let storagePath = req.body.storagePath || existingDoc.storagePath;
      let mimeType = req.body.mimeType || existingDoc.mimeType;

      // Handle multipart file upload to Cloudflare R2 for replacement
      if (req.file) {
        fileName = req.file.originalname;
        mimeType = req.file.mimetype;
        fileSize = `${(req.file.size / (1024 * 1024)).toFixed(2)} MB`;

        const key = R2Service.generateKey('products', existingDoc.productId, fileName);
        await R2Service.upload({
          key,
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          metadata: { productId: existingDoc.productId, title: title || existingDoc.title },
        });

        storagePath = key;
        fileUrl = `/api/v1/products/${existingDoc.productId}/documents/r2/${encodeURIComponent(key)}`;
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
          fileName,
          storagePath,
          fileSize,
          mimeType,
          version: version || 'v2.0',
          uploadedBy: req.user?.email || 'Admin',
          fileUrl,
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
          storagePath,
        },
      });

      return ApiResponse.success(
        res,
        newVersionDoc,
        `Datasheet replaced and upgraded to ${newVersionDoc.version}. Stored in Cloudflare R2.`
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

      // Delete from Cloudflare R2 if stored there
      if (doc.storagePath) {
        try {
          await R2Service.delete(doc.storagePath);
        } catch (r2Err) {
          console.warn('[R2 Storage]: Warning deleting object from bucket', r2Err);
        }
      }

      await prisma.productDocument.delete({ where: { id: docId } });

      // Audit Log
      await AuditService.log({
        actorUserId: req.user?.id,
        action: 'DOCUMENT_DELETED',
        entityType: 'ProductDocument',
        entityId: docId,
        metadata: { fileName: doc.fileName, storagePath: doc.storagePath },
      });

      return ApiResponse.success(res, null, 'Document removed from library and storage');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
