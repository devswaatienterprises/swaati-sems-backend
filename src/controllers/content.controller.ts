import { Request, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { ContentService } from '../services/content.service';

export class ContentController {
  /**
   * GET /api/v1/content/bundle?lang=en&module=all
   * Fetches translation bundle directly from translations_management for the CRM interface
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
}
