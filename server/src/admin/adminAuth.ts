import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function adminSecret(): string {
  return process.env.EASY_BIDDING_ADMIN_SECRET || process.env.EASY_BIDDING_DEV_ADMIN_SECRET || '';
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function bearerToken(req: Request): string {
  const value = String(req.headers.authorization ?? '').trim();
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function createAdminToken(): string {
  const secret = adminSecret();
  if (!secret) throw new Error('未配置 EASY_BIDDING_ADMIN_SECRET。');
  const payload = base64url(
    JSON.stringify({
      role: 'admin',
      iat: Date.now(),
      exp: Date.now() + TOKEN_TTL_MS,
    }),
  );
  return `admin.${payload}.${sign(payload, secret)}`;
}

export function verifyAdminToken(token: string): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  const [, payload, signature] = parts;
  if (!timingSafeHexEqual(sign(payload, secret), signature)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: string;
      exp?: number;
    };
    return parsed.role === 'admin' && typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export function isAdminRequest(req: Request): boolean {
  const secret = adminSecret();
  if (secret && req.headers['x-easy-bidding-admin-secret'] === secret) return true;
  const token = String(req.headers['x-easy-bidding-admin-token'] ?? '').trim() || bearerToken(req);
  return verifyAdminToken(token);
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ message: '需要管理员权限。' });
  }
  next();
};
