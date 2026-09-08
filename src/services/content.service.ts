import { prisma } from '../config/db';
import { AuditService } from './audit.service';

export class ContentService {
  /**
   * Retrieve a key-value translation bundle for a requested language and optional module.
   * Reads directly from the single-source 'translations_management' table in Supabase.
   * Implements fallback: Target Language (mr/hi) -> Default Language (en) -> Alias Key
   */
  static async getBundle(langCode: string = 'en', moduleFilter?: string) {
    try {
      const normalizedLang = (langCode || 'en').toLowerCase();
      const whereClause: any = {};
      if (moduleFilter && moduleFilter !== 'all') {
        whereClause.module = moduleFilter;
      }

      const items = await prisma.translationManagement.findMany({
        where: whereClause,
        orderBy: [{ module: 'asc' }, { alias: 'asc' }],
      });

      const bundle: Record<string, string> = {};

      for (const item of items) {
        let value = '';
        if (normalizedLang === 'mr') {
          value = item.marathi?.trim() || item.english?.trim() || item.alias;
        } else if (normalizedLang === 'hi') {
          value = item.hindi?.trim() || item.english?.trim() || item.alias;
        } else {
          value = item.english?.trim() || item.alias;
        }
        bundle[item.alias] = value;
      }

      const langNames: Record<string, string> = {
        en: 'English',
        mr: 'मराठी',
        hi: 'हिंदी',
      };

      return {
        language: normalizedLang,
        languageName: langNames[normalizedLang] || 'English',
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
   * Get all supported languages
   */
  static async getLanguages() {
    return [
      { code: 'en', name: 'English', isDefault: true, isEnabled: true },
      { code: 'mr', name: 'मराठी', isDefault: false, isEnabled: true },
      { code: 'hi', name: 'हिंदी', isDefault: false, isEnabled: true },
    ];
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

  /**
   * Update or create a unified content row (with English, Marathi, and Hindi translations side-by-side)
   */
  static async updateContentRow({
    contentKey,
    en,
    mr,
    hi,
    description,
    module,
    userId,
    userName = 'Admin',
  }: {
    contentKey: string;
    en?: string;
    mr?: string;
    hi?: string;
    description?: string;
    module?: string;
    userId?: string;
    userName?: string;
  }) {
    if (!contentKey || !contentKey.trim()) {
      throw new Error('Alias / Content key is required');
    }

    const trimmedKey = contentKey.trim();

    // 1. Ensure languages exist
    const languages = await prisma.language.findMany();
    const langMap = new Map(languages.map((l) => [l.code.toLowerCase(), l]));

    // 2. Find or create content item
    let contentItem = await prisma.contentItem.findUnique({
      where: { contentKey: trimmedKey },
    });

    if (!contentItem) {
      contentItem = await prisma.contentItem.create({
        data: {
          contentKey: trimmedKey,
          module: module?.trim() || (trimmedKey.includes('.') ? trimmedKey.split('.')[0] : 'global'),
          contentType: 'text',
          description: description?.trim() || null,
          isActive: true,
          createdBy: userName,
          updatedBy: userName,
        },
      });
    } else {
      // Update metadata if provided
      const updateData: any = { updatedBy: userName };
      if (description !== undefined) updateData.description = description.trim();
      if (module !== undefined && module.trim()) updateData.module = module.trim();

      contentItem = await prisma.contentItem.update({
        where: { id: contentItem.id },
        data: updateData,
      });
    }

    // 3. Save translations for each language (en, mr, hi)
    const langValues: { code: string; value?: string }[] = [
      { code: 'en', value: en },
      { code: 'mr', value: mr },
      { code: 'hi', value: hi },
    ];

    for (const { code, value } of langValues) {
      if (value === undefined) continue;

      const lang = langMap.get(code);
      if (!lang) continue;

      const trimmedVal = value.trim();

      const existing = await prisma.contentTranslation.findUnique({
        where: {
          contentItemId_languageId: {
            contentItemId: contentItem.id,
            languageId: lang.id,
          },
        },
      });

      const isChanged = !existing || existing.value !== trimmedVal;

      if (isChanged) {
        await prisma.contentTranslation.upsert({
          where: {
            contentItemId_languageId: {
              contentItemId: contentItem.id,
              languageId: lang.id,
            },
          },
          create: {
            contentItemId: contentItem.id,
            languageId: lang.id,
            value: trimmedVal,
            status: 'published',
            createdBy: userName,
            updatedBy: userName,
          },
          update: {
            value: trimmedVal,
            status: 'published',
            updatedBy: userName,
          },
        });

        // Record Version
        const latestVersion = await prisma.contentVersion.findFirst({
          where: {
            contentItemId: contentItem.id,
            languageId: lang.id,
          },
          orderBy: { version: 'desc' },
        });

        const nextVersionNumber = (latestVersion?.version || 0) + 1;

        await prisma.contentVersion.create({
          data: {
            contentItemId: contentItem.id,
            languageId: lang.id,
            version: nextVersionNumber,
            value: trimmedVal,
            status: 'published',
            changedBy: userName,
          },
        });
      }
    }

    // Audit Log
    await AuditService.log({
      actorUserId: userId || undefined,
      action: 'CONTENT_ROW_UPDATED',
      entityType: 'ContentItem',
      entityId: contentItem.id,
      metadata: { contentKey: trimmedKey, en, mr, hi, module: contentItem.module },
    });

    return await prisma.contentItem.findUnique({
      where: { id: contentItem.id },
      include: {
        translations: { include: { language: true } },
        versions: { orderBy: { version: 'desc' }, take: 5 },
      },
    });
  }

  /**
   * Import CSV rows (Alias, English, Marathi, Hindi, Module, Description)
   */
  static async importCsvData({
    rows,
    userId,
    userName = 'Admin',
  }: {
    rows: Array<{
      Alias?: string;
      alias?: string;
      English?: string;
      english?: string;
      en?: string;
      Marathi?: string;
      marathi?: string;
      mr?: string;
      Hindi?: string;
      hindi?: string;
      hi?: string;
      Module?: string;
      module?: string;
      Description?: string;
      description?: string;
    }>;
    userId?: string;
    userName?: string;
  }) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('CSV data is empty or invalid.');
    }

    let updatedCount = 0;
    let createdCount = 0;
    const errors: string[] = [];
    const seenAliasesInBatch = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawAlias = row.Alias || row.alias;
      const rowNum = i + 1;

      if (!rawAlias || !rawAlias.trim()) {
        errors.push(`Row ${rowNum}: Skipped because Alias is missing or blank.`);
        continue;
      }

      const alias = rawAlias.trim();

      if (seenAliasesInBatch.has(alias)) {
        errors.push(`Row ${rowNum}: Duplicate Alias '${alias}' in CSV batch. Only the first occurrence was processed.`);
        continue;
      }
      seenAliasesInBatch.add(alias);

      const enVal = (row.English ?? row.english ?? row.en ?? '').toString();
      const mrVal = (row.Marathi ?? row.marathi ?? row.mr ?? '').toString();
      const hiVal = (row.Hindi ?? row.hindi ?? row.hi ?? '').toString();
      const modVal = (row.Module ?? row.module ?? '').toString();
      const descVal = (row.Description ?? row.description ?? '').toString();

      try {
        const existing = await prisma.contentItem.findUnique({
          where: { contentKey: alias },
        });

        if (existing) {
          await ContentService.updateContentRow({
            contentKey: alias,
            en: enVal,
            mr: mrVal,
            hi: hiVal,
            module: modVal || existing.module,
            description: descVal || existing.description || undefined,
            userId,
            userName,
          });
          updatedCount++;
        } else {
          await ContentService.updateContentRow({
            contentKey: alias,
            en: enVal,
            mr: mrVal,
            hi: hiVal,
            module: modVal || (alias.includes('.') ? alias.split('.')[0] : 'global'),
            description: descVal || undefined,
            userId,
            userName,
          });
          createdCount++;
        }
      } catch (err: any) {
        errors.push(`Row ${rowNum} (${alias}): ${err.message}`);
      }
    }

    return {
      totalProcessed: seenAliasesInBatch.size,
      updatedCount,
      createdCount,
      errorsCount: errors.length,
      errors,
    };
  }

  /**
   * Advanced: Rename content key / Alias
   */
  static async updateAlias({
    id,
    newContentKey,
    userId,
    userName = 'Admin',
  }: {
    id: string;
    newContentKey: string;
    userId?: string;
    userName?: string;
  }) {
    const trimmed = newContentKey.trim();
    if (!trimmed) throw new Error('New Alias cannot be empty');

    const item = await prisma.contentItem.findUnique({ where: { id } });
    if (!item) throw new Error('Content item not found');

    if (item.contentKey === trimmed) return item;

    const conflict = await prisma.contentItem.findUnique({ where: { contentKey: trimmed } });
    if (conflict) {
      throw new Error(`An item with Alias '${trimmed}' already exists.`);
    }

    const updated = await prisma.contentItem.update({
      where: { id },
      data: {
        contentKey: trimmed,
        updatedBy: userName,
      },
    });

    await AuditService.log({
      actorUserId: userId,
      action: 'CONTENT_ALIAS_RENAMED',
      entityType: 'ContentItem',
      entityId: id,
      oldValue: item.contentKey,
      newValue: trimmed,
    });

    return updated;
  }
}
