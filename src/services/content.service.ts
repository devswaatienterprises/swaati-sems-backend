import { prisma } from '../config/db';
import { AuditService } from './audit.service';

export class ContentService {
  /**
   * Retrieve a key-value translation bundle for a requested language and optional module.
   * Implements fallback hierarchy: Requested Language (published) -> Default Language 'en' (published) -> Content Key
   */
  static async getBundle(langCode: string = 'en', moduleFilter?: string) {
    try {
      // 1. Resolve target language and default fallback language
      const targetLang = await prisma.language.findUnique({
        where: { code: langCode.toLowerCase() },
      });

      const defaultLang = await prisma.language.findFirst({
        where: { isDefault: true, isEnabled: true },
      }) || await prisma.language.findFirst({
        where: { code: 'en' },
      });

      const whereClause: any = { isActive: true };
      if (moduleFilter && moduleFilter !== 'all') {
        whereClause.module = moduleFilter;
      }

      // 2. Fetch all active content items with their published translations
      const contentItems = await prisma.contentItem.findMany({
        where: whereClause,
        include: {
          translations: {
            where: { status: 'published' },
            include: { language: true },
          },
        },
      });

      // 3. Assemble dictionary with fallback logic
      const bundle: Record<string, string> = {};

      for (const item of contentItems) {
        const translations = item.translations || [];

        // Try requested language first
        const targetTranslation = targetLang
          ? translations.find((t) => t.languageId === targetLang.id)
          : null;

        if (targetTranslation && targetTranslation.value) {
          bundle[item.contentKey] = targetTranslation.value;
          continue;
        }

        // Fallback to default language ('en')
        const defaultTranslation = defaultLang
          ? translations.find((t) => t.languageId === defaultLang.id)
          : null;

        if (defaultTranslation && defaultTranslation.value) {
          bundle[item.contentKey] = defaultTranslation.value;
          continue;
        }

        // Ultimate fallback: contentKey itself
        bundle[item.contentKey] = item.contentKey;
      }

      return {
        language: targetLang ? targetLang.code : (defaultLang?.code || 'en'),
        languageName: targetLang ? targetLang.name : (defaultLang?.name || 'English'),
        totalKeys: Object.keys(bundle).length,
        bundle,
      };
    } catch (err) {
      console.error('[ContentService getBundle Error]:', err);
      return {
        language: langCode,
        languageName: 'English',
        totalKeys: 0,
        bundle: {},
      };
    }
  }

  /**
   * Get all enabled languages
   */
  static async getLanguages() {
    return await prisma.language.findMany({
      where: { isEnabled: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Get all content items with all translations (for Admin management)
   */
  static async getAllContentItems(moduleFilter?: string) {
    const whereClause: any = {};
    if (moduleFilter && moduleFilter !== 'all') {
      whereClause.module = moduleFilter;
    }

    return await prisma.contentItem.findMany({
      where: whereClause,
      include: {
        translations: {
          include: { language: true },
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 5,
        },
      },
      orderBy: [{ module: 'asc' }, { contentKey: 'asc' }],
    });
  }

  /**
   * Update or create a content translation with draft/published workflow and version tracking
   */
  static async setTranslation({
    contentKey,
    languageCode,
    value,
    status = 'published',
    userId,
    userName,
  }: {
    contentKey: string;
    languageCode: string;
    value: string;
    status?: 'draft' | 'published' | 'archived';
    userId?: string;
    userName?: string;
  }) {
    // 1. Find content item and language
    const contentItem = await prisma.contentItem.findUnique({
      where: { contentKey },
    });
    if (!contentItem) {
      throw new Error(`Content item with key '${contentKey}' not found.`);
    }

    const language = await prisma.language.findUnique({
      where: { code: languageCode.toLowerCase() },
    });
    if (!language) {
      throw new Error(`Language with code '${languageCode}' not found.`);
    }

    // 2. Find existing translation
    const existing = await prisma.contentTranslation.findUnique({
      where: {
        contentItemId_languageId: {
          contentItemId: contentItem.id,
          languageId: language.id,
        },
      },
    });

    const oldValue = existing ? existing.value : null;

    // 3. Upsert translation
    const updatedTranslation = await prisma.contentTranslation.upsert({
      where: {
        contentItemId_languageId: {
          contentItemId: contentItem.id,
          languageId: language.id,
        },
      },
      create: {
        contentItemId: contentItem.id,
        languageId: language.id,
        value,
        status,
        createdBy: userName || 'Admin',
        updatedBy: userName || 'Admin',
      },
      update: {
        value,
        status,
        updatedBy: userName || 'Admin',
      },
    });

    // 4. If published, record in version history
    if (status === 'published') {
      const latestVersion = await prisma.contentVersion.findFirst({
        where: {
          contentItemId: contentItem.id,
          languageId: language.id,
        },
        orderBy: { version: 'desc' },
      });

      const nextVersionNumber = (latestVersion?.version || 0) + 1;

      await prisma.contentVersion.create({
        data: {
          contentItemId: contentItem.id,
          languageId: language.id,
          version: nextVersionNumber,
          value,
          status: 'published',
          changedBy: userName || 'Admin',
        },
      });

      // 5. Create Audit Log
      await AuditService.log({
        actorUserId: userId || undefined,
        action: 'CONTENT_TRANSLATION_PUBLISHED',
        entityType: 'ContentTranslation',
        entityId: contentKey,
        oldValue: oldValue || undefined,
        newValue: value,
        metadata: {
          contentKey,
          languageCode,
          version: nextVersionNumber,
          module: contentItem.module,
        },
      });
    }

    return updatedTranslation;
  }
}
