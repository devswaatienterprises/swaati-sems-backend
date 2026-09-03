import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../utils/apiResponse';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('[API Error Caught]:', err.message || err);

  let statusCode = err.statusCode || 500;
  let userFriendlyMessage = err.message || 'An unexpected error occurred. Please try again.';

  // Handle Prisma unique constraint violation (P2002)
  if (err.code === 'P2002') {
    statusCode = 400;
    const targetField = err.meta?.target?.[0] || 'field';
    userFriendlyMessage = `A record with this ${targetField} already exists in the system.`;
  }

  // Handle Prisma record not found (P2025)
  if (err.code === 'P2025') {
    statusCode = 404;
    userFriendlyMessage = 'Requested record was not found or has been removed.';
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    userFriendlyMessage = 'Invalid session token. Please sign in again.';
  }

  return ApiResponse.error(
    res,
    userFriendlyMessage,
    statusCode,
    process.env.NODE_ENV === 'development' ? err.stack : null
  );
}
