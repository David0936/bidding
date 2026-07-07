// 投标主体档案：按账户保存企业、法定代表人与常用委托代理人信息。
import fs from 'node:fs';
import path from 'node:path';
import { BIDDER_PROFILES_DIR, ensureDirs } from '../store/paths.js';

export interface BidderProfile {
  companyName: string;
  unifiedSocialCreditCode: string;
  address: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  legalRep: { name: string; idNo: string; phone: string };
  agent: { name: string; idNo: string; phone: string; email: string };
  updatedAt: string;
}

type LegacyBidderProfile = Partial<BidderProfile> & {
  creditCode?: unknown;
  legalRep?: Partial<BidderProfile['legalRep']> & { idNumber?: unknown };
  agent?: Partial<BidderProfile['agent']> & { idNumber?: unknown };
};

function nowIso(): string {
  return new Date().toISOString();
}

function safeAccountId(accountId: string): string {
  return accountId.replace(/[^\w.-]/g, '_').slice(0, 90) || 'default-account';
}

function profileFile(accountId: string): string {
  return path.join(BIDDER_PROFILES_DIR, `${safeAccountId(accountId)}.json`);
}

function cleanString(value: unknown, max = 200): string {
  return String(value ?? '').trim().slice(0, max);
}

export function emptyBidderProfile(): BidderProfile {
  return {
    companyName: '',
    unifiedSocialCreditCode: '',
    address: '',
    phone: '',
    bankName: '',
    bankAccount: '',
    legalRep: { name: '', idNo: '', phone: '' },
    agent: { name: '', idNo: '', phone: '', email: '' },
    updatedAt: '',
  };
}

export function normalizeBidderProfile(input: Partial<BidderProfile> | null | undefined): BidderProfile {
  const raw = (input ?? {}) as LegacyBidderProfile;
  const legalRep = (raw.legalRep ?? {}) as NonNullable<LegacyBidderProfile['legalRep']>;
  const agent = (raw.agent ?? {}) as NonNullable<LegacyBidderProfile['agent']>;
  return {
    companyName: cleanString(raw.companyName),
    unifiedSocialCreditCode: cleanString(raw.unifiedSocialCreditCode || raw.creditCode, 80),
    address: cleanString(raw.address, 300),
    phone: cleanString(raw.phone, 80),
    bankName: cleanString(raw.bankName, 160),
    bankAccount: cleanString(raw.bankAccount, 80),
    legalRep: {
      name: cleanString(legalRep.name, 80),
      idNo: cleanString(legalRep.idNo || legalRep.idNumber, 80),
      phone: cleanString(legalRep.phone, 80),
    },
    agent: {
      name: cleanString(agent.name, 80),
      idNo: cleanString(agent.idNo || agent.idNumber, 80),
      phone: cleanString(agent.phone, 80),
      email: cleanString(agent.email, 120),
    },
    updatedAt: cleanString(raw.updatedAt) || nowIso(),
  };
}

export function getBidderProfile(accountId: string): BidderProfile {
  ensureDirs();
  try {
    const parsed = JSON.parse(fs.readFileSync(profileFile(accountId), 'utf-8')) as Partial<BidderProfile>;
    return normalizeBidderProfile(parsed);
  } catch {
    return emptyBidderProfile();
  }
}

export function saveBidderProfile(accountId: string, input: Partial<BidderProfile>): BidderProfile {
  ensureDirs();
  const profile = normalizeBidderProfile({ ...input, updatedAt: nowIso() });
  fs.writeFileSync(profileFile(accountId), JSON.stringify(profile, null, 2), 'utf-8');
  return profile;
}
