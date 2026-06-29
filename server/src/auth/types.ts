export interface AuthUser {
  id: string;
  accountId: string;
  email: string;
  displayName: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  accountId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string;
}

export interface AuthState {
  users: AuthUser[];
  sessions: AuthSession[];
}

export interface AuthProfile {
  id: string;
  accountId: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: AuthProfile;
}
