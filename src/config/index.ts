import dotenv from "dotenv";
import path from "path";
import type { Config } from "../types";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const storageProvider = process.env.STORAGE_PROVIDER === "s3" ? "s3" : "local";

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  appVersion: process.env.npm_package_version ?? "1.0.0",
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : ["http://localhost:4200", "http://localhost:3000", "http://localhost:3001"],
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  authCookieName: process.env.AUTH_COOKIE_NAME || "hypermarket_auth",
  authCookieHttpOnly: process.env.AUTH_COOKIE_HTTPONLY !== "false",
  authCookieSameSite: (process.env.AUTH_COOKIE_SAMESITE as "strict" | "lax" | "none") || "lax",
  authCookieMaxAgeSeconds: Number(process.env.AUTH_COOKIE_MAX_AGE_SECONDS) || 60 * 60 * 24,
  authCookieSecure: process.env.AUTH_COOKIE_SECURE === "true",
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/hypermarket",
  mongodbBackupUri: process.env.MONGODB_BACKUP_URI || undefined,
  backupDir: process.env.BACKUP_DIR || "backups",
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60_000,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 300,
  e2eDisableAuthRateLimit: process.env.E2E_DISABLE_AUTH_RATE_LIMIT === "true",
  storageProvider,
  storageLocalDir: process.env.STORAGE_LOCAL_DIR || path.resolve(process.cwd(), "storage"),
  storagePublicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`,
  storagePublicRelative:
    process.env.STORAGE_PUBLIC_RELATIVE !== "false" &&
    storageProvider === "local" &&
    (process.env.NODE_ENV || "development") !== "production",
  uploadMaxSizeBytes: Number(process.env.UPLOAD_MAX_SIZE_BYTES) || 5 * 1024 * 1024,
  uploadPresignExpiresSeconds: Number(process.env.UPLOAD_PRESIGN_EXPIRES_SECONDS) || 600,
  r2AccountId: process.env.R2_ACCOUNT_ID || undefined,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || undefined,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || undefined,
  r2Bucket: process.env.R2_BUCKET || undefined,
  r2PublicUrl: process.env.R2_PUBLIC_URL || undefined,
};

export default config;
