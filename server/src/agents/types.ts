export type AgentType = 'personal' | 'enterprise';
export type AgentStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type AgentReferralStatus = 'lead' | 'pending_settlement' | 'settled';

export interface AgentProgramTier {
  type: AgentType;
  name: string;
  commissionRate: number;
  customerRebateRate: number;
  requirements: string[];
  benefits: string[];
}

export interface AgentApplication {
  id: string;
  accountId: string;
  type: AgentType;
  applicantName: string;
  phone: string;
  companyName?: string;
  city?: string;
  industry?: string;
  channel?: string;
  note?: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfile {
  accountId: string;
  type: AgentType;
  status: AgentStatus;
  inviteCode: string;
  commissionRate: number;
  customerRebateRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentReferral {
  id: string;
  agentAccountId: string;
  inviteCode: string;
  customerName: string;
  customerEmail?: string;
  rechargeCents: number;
  commissionCents: number;
  status: AgentReferralStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
  settledAt?: string;
}

export interface AgentSummary {
  invitedCustomerCount: number;
  totalRechargeCents: number;
  pendingCommissionCents: number;
  settledCommissionCents: number;
}

export interface AgentOverview {
  program: AgentProgramTier[];
  application: AgentApplication | null;
  profile: AgentProfile | null;
  referrals: AgentReferral[];
  summary: AgentSummary;
}

export interface AgentAdminOverview {
  program: AgentProgramTier[];
  applications: AgentApplication[];
  profiles: AgentProfile[];
  referrals: AgentReferral[];
  summary: AgentSummary & {
    agentCount: number;
    applicationCount: number;
  };
}

export interface AgentState {
  applications: AgentApplication[];
  profiles: AgentProfile[];
  referrals: AgentReferral[];
}
