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
   * PUT /api/v1/content/translations (Admin)
   * Updates or drafts a translation
   */
  static async updateTranslation(req: AuthRequest, res: Response) {
    try {
      const { contentKey, languageCode, value, status = 'published' } = req.body;

      if (!contentKey || !languageCode || value === undefined) {
        return ApiResponse.error(res, 'contentKey, languageCode, and value are required', 400);
      }

      const updated = await ContentService.setTranslation({
        contentKey,
        languageCode,
        value,
        status,
        userId: req.user?.id,
        userName: req.user?.email || 'Admin',
      });

      return ApiResponse.success(res, updated, 'Content translation saved successfully');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
