import winston from 'winston';
import path from 'path';
import os from 'os';
import fs from 'fs';

const defaultLogDir = path.join(os.homedir(), '.bitbucket-server-mcp');
const logFilePath = process.env.BITBUCKET_LOG_PATH || path.join(defaultLogDir, 'bitbucket.log');

// Ensure log directory exists safely
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Regex patterns to match Bearer tokens and Bitbucket PAT formats
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9_\-.:]+/gi;
const BBDC_PAT_REGEX = /BBDC-[A-Za-z0-9_-]+/gi;

/**
 * Recursively sanitizes any value or object to eliminate credentials.
 * Uses WeakSet to prevent circular reference infinite loops.
 */
export function sanitizeLogData(val: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (depth > 6 || val === null || val === undefined) {
    return val;
  }

  if (typeof val === 'string') {
    return val
      .replace(BEARER_REGEX, 'Bearer [REDACTED]')
      .replace(BBDC_PAT_REGEX, 'BBDC-[REDACTED]');
  }

  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeLogData(item, depth + 1, seen));
  }

  if (typeof val === 'object') {
    // Prevent circular reference crashes
    if (seen.has(val)) {
      return '[Circular]';
    }
    seen.add(val);

    const result: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(val as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      // Completely redact known credential field names
      if (
        lower === 'authorization' ||
        lower === 'x-bitbucket-token' ||
        lower.includes('password') ||
        lower.includes('secret')
      ) {
        result[key] = '[REDACTED]';
      } else if (lower === 'config' && prop && typeof prop === 'object' && 'headers' in (prop as Record<string, unknown>)) {
        // Axios config object: strip raw headers
        const configCopy = { ...(prop as Record<string, unknown>) };
        delete configCopy.headers;
        delete configCopy.httpAgent;
        delete configCopy.httpsAgent;
        result[key] = sanitizeLogData(configCopy, depth + 1, seen);
      } else if (lower === 'request' && prop && typeof prop === 'object' && ('_header' in (prop as Record<string, unknown>) || 'socket' in (prop as Record<string, unknown>))) {
        // Node.js ClientRequest object: drop circular and socket state
        result[key] = '[ClientRequest]';
      } else {
        result[key] = sanitizeLogData(prop, depth + 1, seen);
      }
    }
    return result;
  }

  return val;
}

/**
 * Extracts safe, sanitized error information to prevent AxiosError header serialization.
 */
export function extractSafeErrorMeta(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return { error: String(error) };
  }

  const err = error as Record<string, unknown>;
  const meta: Record<string, unknown> = {
    message: err.message,
    name: err.name,
    code: err.code,
  };

  if (err.response && typeof err.response === 'object') {
    const res = err.response as Record<string, unknown>;
    meta.status = res.status;
    meta.statusText = res.statusText;
    meta.responseData = sanitizeLogData(res.data);
  }

  if (err.config && typeof err.config === 'object') {
    const cfg = err.config as Record<string, unknown>;
    meta.url = cfg.url;
    meta.method = cfg.method;
    meta.baseURL = cfg.baseURL;
  }

  return meta;
}

/**
 * Winston format that applies deep recursive credential sanitization.
 */
const redactFormat = winston.format((info) => {
  return sanitizeLogData(info) as winston.Logform.TransformableInfo;
});

export const logger = winston.createLogger({
  level: process.env.BITBUCKET_LOG_LEVEL || 'info',
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: logFilePath })
  ],
});

