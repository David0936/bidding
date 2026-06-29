import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AUTH_DIR, ensureDirs } from '../store/paths.js';
import type { AuthProfile, AuthResult, AuthSession, AuthState, AuthUser } from './types.js';

const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');
const TOKEN_DAYS = 30;

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function readState(): AuthState {
  ensureDirs();
  if (!fs.existsSync(AUTH_FILE)) return { users: [], sessions: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) as Partial<AuthState>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { users: [], sessions: [] };
  }
}

function writeState(state: AuthState): void {
  ensureDirs();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

function normalizeName(name: unknown, email: string): string {
  const value = String(name ?? '').trim();
  if (value) return value.slice(0, 60);
  return email.split('@')[0] || '客户';
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function profileFromUser(user: AuthUser): AuthProfile {
  return {
    id: user.id,
    accountId: user.accountId,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

function createToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function createSession(state: AuthState, user: AuthUser): string {
  const token = createToken();
  const now = new Date();
  const expires = new Date(now.getTime() + TOKEN_DAYS * 24 * 60 * 60 * 1000);
  const session: AuthSession = {
    id: crypto.randomUUID(),
    userId: user.id,
    accountId: user.accountId,
    tokenHash: hashToken(token),
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  state.sessions.unshift(session);
  return token;
}

function pruneExpiredSessions(state: AuthState): void {
  const now = Date.now();
  state.sessions = state.sessions.filter((item) => new Date(item.expiresAt).getTime() > now);
}

export function registerUser(input: {
  email: unknown;
  password: unknown;
  displayName?: unknown;
}): AuthResult {
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('请输入有效邮箱。', 400);
  }
  if (password.length < 8) {
    throw new AuthError('密码至少需要 8 位。', 400);
  }

  const state = readState();
  pruneExpiredSessions(state);
  if (state.users.some((item) => item.email === email)) {
    throw new AuthError('该邮箱已注册，请直接登录。', 409);
  }

  const timestamp = nowIso();
  const { salt, hash } = hashPassword(password);
  const user: AuthUser = {
    id: crypto.randomUUID(),
    accountId: `acct_${crypto.randomUUID()}`,
    email,
    displayName: normalizeName(input.displayName, email),
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  state.users.push(user);
  const token = createSession(state, user);
  writeState(state);
  return { token, user: profileFromUser(user) };
}

export function loginUser(input: { email: unknown; password: unknown }): AuthResult {
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? '');
  const state = readState();
  pruneExpiredSessions(state);
  const user = state.users.find((item) => item.email === email);
  if (!user) {
    throw new AuthError('邮箱或密码不正确。');
  }

  const { hash } = hashPassword(password, user.passwordSalt);
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new AuthError('邮箱或密码不正确。');
  }

  user.lastLoginAt = nowIso();
  user.updatedAt = user.lastLoginAt;
  const token = createSession(state, user);
  writeState(state);
  return { token, user: profileFromUser(user) };
}

export function resolveToken(token: string | null | undefined): AuthProfile | null {
  if (!token) return null;
  const state = readState();
  pruneExpiredSessions(state);
  const tokenHash = hashToken(token);
  const session = state.sessions.find((item) => item.tokenHash === tokenHash);
  if (!session) {
    writeState(state);
    return null;
  }
  const user = state.users.find((item) => item.id === session.userId);
  if (!user) {
    state.sessions = state.sessions.filter((item) => item.id !== session.id);
    writeState(state);
    return null;
  }
  session.lastUsedAt = nowIso();
  writeState(state);
  return profileFromUser(user);
}

export function logoutToken(token: string | null | undefined): void {
  if (!token) return;
  const state = readState();
  const tokenHash = hashToken(token);
  state.sessions = state.sessions.filter((item) => item.tokenHash !== tokenHash);
  writeState(state);
}

export function extractBearerToken(authorization: unknown): string | null {
  const value = String(authorization ?? '').trim();
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
