import { Request, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { ContentService } from '../services/content.service';

export class ContentController {
  /**
   * GET /api/v1/content/bundle?lang=en&module=all
   * Fetches published translation bundle for the CRM interface
   */
  static async getBundle(req: Request, res: Response) {
    try {
      const lang = (req.query.lang as string) || 'en';
      const module = req.query.module as string | undefined;

      const result = await ContentService.getBundle(lang, module);
      return ApiResponse.success(res, result, 'Content translation bundle retrieved');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * GET /api/v1/content/languages
   * Returns list of supported languages
   */
  static async getLanguages(req: Request, res: Response) {
    try {
      const languages = await ContentService.getLanguages();
      return ApiResponse.success(res, languages, 'Supported languages retrieved');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * GET /api/v1/content/items (Admin)
   * Returns all items and translations
   */
  static async getItems(req: AuthRequest, res: Response) {
    try {
      const module = req.query.module as string | undefined;
      const items = await ContentService.getAllContentItems(module);
      return ApiResponse.success(res, items, 'Content items retrieved');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * PUT /api/v1/content/row (Admin)
   * Updates a unified content row (Alias, English, Marathi, Hindi, Module, Description)
   */
  static async updateRow(req: AuthRequest, res: Response) {
    try {
      const { contentKey, alias, en, mr, hi, description, module } = req.body;
      const key = (alias || contentKey || '').trim();

      if (!key) {
        return ApiResponse.error(res, 'Alias / contentKey is required', 400);
      }

      const updated = await ContentService.updateContentRow({
        contentKey: key,
        en,
        mr,
        hi,
        description,
        module,
        userId: req.user?.id,
        userName: req.user?.email || 'Admin',
      });

      return ApiResponse.success(res, updated, `Translation row for '${key}' updated successfully`);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * POST /api/v1/content/items (Admin)
   * Creates a new content item with initial translations
   */
  static async createItem(req: AuthRequest, res: Response) {
    try {
      const { contentKey, alias, en, mr, hi, description, module } = req.body;
      const key = (alias || contentKey || '').trim();

      if (!key) {
        return ApiResponse.error(res, 'Alias / contentKey is required', 400);
      }

      const created = await ContentService.updateContentRow({
        contentKey: key,
        en: en || '',
        mr: mr || '',
        hi: hi || '',
        description,
        module,
        userId: req.user?.id,
        userName: req.user?.email || 'Admin',
      });

      return ApiResponse.success(res, created, `New content item '${key}' created successfully`, 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * POST /api/v1/content/import-csv (Admin)
   * Batch imports translations from CSV row objects
   */
  static async importCsv(req: AuthRequest, res: Response) {
    try {
      const { rows } = req.body;

      if (!rows || !Array.isArray(rows)) {
        return ApiResponse.error(res, 'Invalid request: rows array is required', 400);
      }

      const summary = await ContentService.importCsvData({
        rows,
        userId: req.user?.id,
        userName: req.user?.email || 'Admin',
      });

      return ApiResponse.success(res, summary, 'CSV translations processed successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * PUT /api/v1/content/items/:id/alias (Admin)
   * Advanced: Rename content key / Alias
   */
  static async updateAlias(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { newContentKey, newAlias } = req.body;
      const targetKey = (newAlias || newContentKey || '').trim();

      if (!targetKey) {
        return ApiResponse.error(res, 'New Alias / contentKey is required', 400);
      }

      const updated = await ContentService.updateAlias({
        id,
        newContentKey: targetKey,
        userId: req.user?.id,
        userName: req.user?.email || 'Admin',
      });

      return ApiResponse.success(res, updated, `Alias renamed to '${targetKey}' successfully`);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
