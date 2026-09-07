import multer from 'multer';
import { Request } from 'express';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../services/r2.service';

const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type (${file.mimetype}). Only PDF, JPG, JPEG, PNG, and WEBP files are permitted.`
      )
    );
  }
};

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES, // 10 MB limit
  },
  fileFilter,
});
