import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// In production, JWT_SECRET is strictly required
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'swaati_enterprise_super_secure_jwt_secret_2026')) {
  throw new Error(
    'FATAL CONFIGURATION ERROR: JWT_SECRET must be set to a secure custom value in production environment.'
  );
}

// In production, DATABASE_URL is strictly required
if (isProduction && !process.env.DATABASE_URL) {
  throw new Error(
    'FATAL CONFIGURATION ERROR: DATABASE_URL must be provided in production environment.'
  );
}

const rawCorsOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const devOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

const explicitOrigins = [
  process.env.FRONTEND_URL?.trim(),
  process.env.CRM_URL?.trim(),
  ...rawCorsOrigins,
].filter(Boolean) as string[];

const CORS_ORIGINS: string[] = isProduction
  ? Array.from(new Set(explicitOrigins))
  : Array.from(new Set([...devOrigins, ...explicitOrigins]));

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: isProduction,
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  JWT_SECRET: process.env.JWT_SECRET || 'swaati_enterprise_super_secure_jwt_secret_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL || '',
  CRM_URL: process.env.CRM_URL || '',
  CORS_ORIGINS,
  R2: {
    ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
    ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
    SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
    BUCKET_NAME: process.env.R2_BUCKET_NAME || 'appswaatienterprises',
    ENDPOINT:
      process.env.R2_ENDPOINT ||
      (process.env.R2_ACCOUNT_ID
        ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : ''),
  },
};

