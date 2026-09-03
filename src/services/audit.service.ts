import { prisma } from '../config/db';

export class AuditService {
  static async log({
    actorUserId,
    action,
    entityType,
    entityId,
    oldValue,
    newValue,
    metadata,
  }: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    oldValue?: any;
    newValue?: any;
    metadata?: any;
  }) {
    try {
      // Ensure passwords or sensitive credentials are never stored in audit logs
      const sanitize = (obj: any) => {
        if (!obj || typeof obj !== 'object') return obj;
        const clone = { ...obj };
        delete clone.password;
        delete clone.passwordHash;
        delete clone.token;
        return clone;
      };

      await prisma.auditLog.create({
        data: {
          actorUserId,
          action,
          entityType,
          entityId,
          oldValue: oldValue ? JSON.stringify(sanitize(oldValue)) : null,
          newValue: newValue ? JSON.stringify(sanitize(newValue)) : null,
          metadata: metadata ? JSON.stringify(sanitize(metadata)) : null,
        },
      });
    } catch (err) {
      console.warn('[Audit Service]: Failed to record audit log', err);
    }
  }
}
