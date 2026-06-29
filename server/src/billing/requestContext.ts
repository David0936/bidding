import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import { extractBearerToken, resolveToken } from '../auth/authStore.js';

export const DEFAULT_ACCOUNT_ID = process.env.EASY_BIDDING_DEFAULT_ACCOUNT_ID || 'default-account';

interface RequestContext {
  accountId: string;
  userId?: string;
  authenticated: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

function normalizeAccountId(input: unknown): string {
  const value = String(input ?? '').trim();
  if (!value) return DEFAULT_ACCOUNT_ID;
  return value.replace(/[^\w.-]/g, '').slice(0, 80) || DEFAULT_ACCOUNT_ID;
}

export function getCurrentAccountId(): string {
  return storage.getStore()?.accountId ?? DEFAULT_ACCOUNT_ID;
}

export function getCurrentUserId(): string | undefined {
  return storage.getStore()?.userId;
}

export function isAuthenticatedRequest(): boolean {
  return storage.getStore()?.authenticated ?? false;
}

export function createRequestContextMiddleware(): RequestHandler {
  return (req, _res, next) => {
    const token = extractBearerToken(req.headers.authorization);
    const user = resolveToken(token);
    const accountId =
      user?.accountId ??
      normalizeAccountId(req.headers['x-easy-bidding-account'] ?? req.headers['x-account-id']);

    storage.run(
      {
        accountId,
        userId: user?.id,
        authenticated: Boolean(user),
      },
      next,
    );
  };
}
