import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR, ensureDirs } from '../store/paths.js';
import type {
  AgentApplication,
  AgentOverview,
  AgentProgramTier,
  AgentReferral,
  AgentReferralStatus,
  AgentState,
  AgentType,
} from './types.js';

const AGENTS_FILE = path.join(AGENTS_DIR, 'agents.json');

export class AgentError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AgentError';
    this.status = status;
  }
}

export const AGENT_PROGRAM: AgentProgramTier[] = [
  {
    type: 'personal',
    name: '个人代理人',
    commissionRate: 0.2,
    customerRebateRate: 0.03,
    requirements: ['实名认证', '可持续维护客户关系', '适合自媒体、咨询顾问、行业销售'],
    benefits: ['固定邀请码', '客户首充绑定', '线下结算佣金'],
  },
  {
    type: 'enterprise',
    name: '企业代理人',
    commissionRate: 0.3,
    customerRebateRate: 0.05,
    requirements: ['企业信息认证', '具备客户服务或售前支持能力', '适合行业集成商、招采服务商'],
    benefits: ['更高佣金比例', '团队客户长期绑定', '可配置企业优惠策略'],
  },
];

function blankState(): AgentState {
  return { applications: [], profiles: [], referrals: [] };
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: unknown, max = 80): string {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeOptionalText(value: unknown, max = 160): string | undefined {
  const text = normalizeText(value, max);
  return text || undefined;
}

function normalizeAgentType(value: unknown): AgentType {
  return value === 'enterprise' ? 'enterprise' : 'personal';
}

function readState(): AgentState {
  ensureDirs();
  if (!fs.existsSync(AGENTS_FILE)) return blankState();
  try {
    const parsed = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf-8')) as Partial<AgentState>;
    return {
      applications: Array.isArray(parsed.applications) ? parsed.applications : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      referrals: Array.isArray(parsed.referrals) ? parsed.referrals : [],
    };
  } catch {
    return blankState();
  }
}

function writeState(state: AgentState): void {
  ensureDirs();
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function programFor(type: AgentType): AgentProgramTier {
  return AGENT_PROGRAM.find((tier) => tier.type === type) ?? AGENT_PROGRAM[0];
}

function generateInviteCode(accountId: string, usedCodes: Set<string>): string {
  for (let i = 0; i < 12; i++) {
    const seed = `${accountId}:${Date.now()}:${i}:${crypto.randomUUID()}`;
    const code = `EB${crypto.createHash('sha1').update(seed).digest('hex').slice(0, 8).toUpperCase()}`;
    if (!usedCodes.has(code)) return code;
  }
  return `EB${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function summarize(referrals: AgentReferral[]) {
  return referrals.reduce(
    (acc, item) => {
      acc.invitedCustomerCount += 1;
      acc.totalRechargeCents += item.rechargeCents;
      if (item.status === 'settled') acc.settledCommissionCents += item.commissionCents;
      else acc.pendingCommissionCents += item.commissionCents;
      return acc;
    },
    {
      invitedCustomerCount: 0,
      totalRechargeCents: 0,
      pendingCommissionCents: 0,
      settledCommissionCents: 0,
    },
  );
}

export function getAgentOverview(accountId: string): AgentOverview {
  const state = readState();
  const application =
    state.applications
      .filter((item) => item.accountId === accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const profile = state.profiles.find((item) => item.accountId === accountId) ?? null;
  const referrals = state.referrals
    .filter((item) => item.agentAccountId === accountId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    program: AGENT_PROGRAM,
    application,
    profile,
    referrals,
    summary: summarize(referrals),
  };
}

export function applyAgent(
  accountId: string,
  input: {
    type?: unknown;
    applicantName?: unknown;
    phone?: unknown;
    companyName?: unknown;
    city?: unknown;
    industry?: unknown;
    channel?: unknown;
    note?: unknown;
  },
): AgentOverview {
  const state = readState();
  const type = normalizeAgentType(input.type);
  const applicantName = normalizeText(input.applicantName);
  const phone = normalizeText(input.phone, 30);
  if (!applicantName) throw new AgentError('请填写申请人姓名。');
  if (!phone) throw new AgentError('请填写联系电话。');
  if (type === 'enterprise' && !normalizeOptionalText(input.companyName)) {
    throw new AgentError('企业代理人需要填写企业名称。');
  }

  const timestamp = nowIso();
  const application: AgentApplication = {
    id: crypto.randomUUID(),
    accountId,
    type,
    applicantName,
    phone,
    companyName: normalizeOptionalText(input.companyName),
    city: normalizeOptionalText(input.city, 40),
    industry: normalizeOptionalText(input.industry, 60),
    channel: normalizeOptionalText(input.channel, 80),
    note: normalizeOptionalText(input.note, 300),
    status: 'approved',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  state.applications.unshift(application);
  const tier = programFor(type);
  const existing = state.profiles.find((item) => item.accountId === accountId);
  const usedCodes = new Set(state.profiles.map((item) => item.inviteCode));
  const profile = {
    accountId,
    type,
    status: 'approved' as const,
    inviteCode: existing?.inviteCode ?? generateInviteCode(accountId, usedCodes),
    commissionRate: tier.commissionRate,
    customerRebateRate: tier.customerRebateRate,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  state.profiles = existing
    ? state.profiles.map((item) => (item.accountId === accountId ? profile : item))
    : [profile, ...state.profiles];
  writeState(state);
  return getAgentOverview(accountId);
}

export function createAgentReferral(
  accountId: string,
  input: {
    customerName?: unknown;
    customerEmail?: unknown;
    rechargeCents?: unknown;
    note?: unknown;
  },
): AgentOverview {
  const state = readState();
  const profile = state.profiles.find((item) => item.accountId === accountId && item.status === 'approved');
  if (!profile) throw new AgentError('请先申请并开通代理人。', 403);

  const customerName = normalizeText(input.customerName);
  if (!customerName) throw new AgentError('请填写客户名称。');
  const rechargeCents = Math.max(0, Math.round(Number(input.rechargeCents) || 0));
  const status: AgentReferralStatus = rechargeCents > 0 ? 'pending_settlement' : 'lead';
  const timestamp = nowIso();
  const referral: AgentReferral = {
    id: crypto.randomUUID(),
    agentAccountId: accountId,
    inviteCode: profile.inviteCode,
    customerName,
    customerEmail: normalizeOptionalText(input.customerEmail, 120),
    rechargeCents,
    commissionCents: Math.round(rechargeCents * profile.commissionRate),
    status,
    note: normalizeOptionalText(input.note, 300),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  state.referrals.unshift(referral);
  writeState(state);
  return getAgentOverview(accountId);
}
