import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';

// Standard error handler for rate limit exceeded
const createRateLimitHandler = (message: string) => {
  return (req: Request, res: Response) => {
    return ApiResponse.error(res, message, 429);
  };
};

/**
 * General API Limiter:
 * Allows 300 requests per 5-minute window per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    'Too many requests from this IP address. Please try again in a few minutes.'
  ),
});

/**
 * Authentication / Login Limiter:
 * Protects against brute-force password guessing.
 * Allows 15 login attempts per 15-minute window per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: createRateLimitHandler(
    'Too many login attempts from this IP address. Please wait 15 minutes before trying again.'
  ),
});

/**
 * Public Contact / Lead Form Limiter:
 * Protects website lead submission against automated spam bots.
 * Allows 10 submissions per 15-minute window per IP.
 */
export const publicLeadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    'Too many enquiry submissions from this IP address. Please wait 15 minutes before submitting again.'
  ),
});

/**
 * File Upload Limiter:
 * Protects Cloudflare R2 upload endpoints and backend memory buffer.
 * Allows 40 uploads per 10-minute window per IP.
 */
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    'Upload rate limit reached. Please wait a few minutes before uploading more documents.'
  ),
});
