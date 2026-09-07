import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { env } from '../config/env';

// Allowed MIME types and extensions for SEMS documents & assets
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export type StorageEntityType = 'products' | 'employees' | 'messages';

export class R2Service {
  private static client: S3Client | null = null;

  /**
   * Initializes and returns the singleton S3 Client configured for Cloudflare R2
   */
  public static getClient(): S3Client {
    if (!this.client) {
      const endpoint = env.R2.ENDPOINT;
      const accessKeyId = env.R2.ACCESS_KEY_ID;
      const secretAccessKey = env.R2.SECRET_ACCESS_KEY;

      if (!accessKeyId || !secretAccessKey) {
        throw new Error(
          'Cloudflare R2 credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not configured.'
        );
      }

      this.client = new S3Client({
        region: 'auto',
        endpoint: endpoint || undefined,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }

    return this.client;
  }

  /**
   * Sanitizes a file name to remove unsafe characters and whitespace
   */
  public static sanitizeFileName(originalName: string): string {
    const base = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return base.replace(/_{2,}/g, '_');
  }

  /**
   * Generates a unique, standardized R2 key for the target entity
   * Format:
   * - products/{productId}/{uuid}-{safeFileName}
   * - employees/{employeeId}/kyc/{uuid}-{safeFileName}
   * - messages/{conversationId}/{uuid}-{safeFileName}
   */
  public static generateKey(
    entityType: StorageEntityType,
    entityId: string,
    originalFileName: string
  ): string {
    const uuid = randomUUID();
    const safeName = this.sanitizeFileName(originalFileName);

    switch (entityType) {
      case 'products':
        return `products/${entityId}/${uuid}-${safeName}`;
      case 'employees':
        return `employees/${entityId}/kyc/${uuid}-${safeName}`;
      case 'messages':
        return `messages/${entityId}/${uuid}-${safeName}`;
      default:
        return `general/${entityId}/${uuid}-${safeName}`;
    }
  }

  /**
   * Validates file size and MIME type
   */
  public static validateFile(mimeType?: string, sizeBytes?: number): { valid: boolean; error?: string } {
    if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      return {
        valid: false,
        error: `Invalid file format (${mimeType}). Allowed formats: PDF, JPG, JPEG, PNG, WEBP.`,
      };
    }

    if (sizeBytes && sizeBytes > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size exceeds the 10 MB limit (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB).`,
      };
    }

    return { valid: true };
  }

  /**
   * Uploads a file buffer directly to Cloudflare R2
   */
  public static async upload({
    key,
    buffer,
    mimeType,
    metadata,
  }: {
    key: string;
    buffer: Buffer;
    mimeType: string;
    metadata?: Record<string, string>;
  }): Promise<{ key: string; bucket: string; size: number }> {
    const validation = this.validateFile(mimeType, buffer.length);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const client = this.getClient();
    const command = new PutObjectCommand({
      Bucket: env.R2.BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: metadata,
    });

    await client.send(command);

    return {
      key,
      bucket: env.R2.BUCKET_NAME,
      size: buffer.length,
    };
  }

  /**
   * Generates a short-lived presigned download URL for private files (default: 1 hour)
   */
  public static async getSignedDownloadUrl(
    key: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const client = this.getClient();
    const command = new GetObjectCommand({
      Bucket: env.R2.BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Retrieves an object stream directly from R2
   */
  public static async getObject(key: string) {
    const client = this.getClient();
    const command = new GetObjectCommand({
      Bucket: env.R2.BUCKET_NAME,
      Key: key,
    });

    return await client.send(command);
  }

  /**
   * Deletes an object from Cloudflare R2
   */
  public static async delete(key: string): Promise<void> {
    const client = this.getClient();
    const command = new DeleteObjectCommand({
      Bucket: env.R2.BUCKET_NAME,
      Key: key,
    });

    await client.send(command);
  }

  /**
   * Checks if an object exists in Cloudflare R2
   */
  public static async exists(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const command = new HeadObjectCommand({
        Bucket: env.R2.BUCKET_NAME,
        Key: key,
      });
      await client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }
}
