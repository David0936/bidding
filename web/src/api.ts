// 与后端交互的轻量封装
import type {
  AIConfig,
  AdminBillingOverview,
  AdminLoginResult,
  AdminMeResult,
  AuthMeResult,
  AuthProfile,
  AuthResult,
  BidReadinessReport,
  BillingAccountStatus,
  BillingFeatureFlags,
  BillingPlanCode,
  BillingOverview,
  ConsistencyAudit,
  DeviationTable,
  DuplicateCheckResult,
  GlobalFacts,
  KnowledgeOverview,
  KnowledgeUploadResult,
  Outline,
  OutlineVariantsResult,
  Project,
  ProjectMaterialChecklist,
  RedactedAIConfig,
  RejectionCheckResult,
  ResponseMatrix,
  SealPlacement,
  SealState,
  TenderAnalysis,
  TenderIndustryProfile,
  TestResult,
  UploadResult,
} from './types';

const AUTH_TOKEN_KEY = 'easyBidding.authToken';
const ADMIN_TOKEN_KEY = 'easyBidding.adminToken';

function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function withAuthHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  const token = getAuthToken();
  if (token) next.set('Authorization', `Bearer ${token}`);
  return next;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = withAuthHeaders(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const resp = await fetch(url, {
    ...init,
    headers,
  });
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.message) detail = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: withAuthHeaders(init?.headers),
  });
}

async function throwIfNotOk(resp: Response): Promise<void> {
  if (resp.ok) return;
  let detail = `HTTP ${resp.status}`;
  try {
    const body = await resp.json();
    if (body?.message) detail = body.message;
  } catch {
    /* ignore */
  }
  throw new Error(detail);
}

async function downloadFromResponse(resp: Response, fallbackName: string): Promise<void> {
  await throwIfNotOk(resp);
  const blob = await resp.blob();
  downloadBlob(blob, fallbackName);
}

function downloadBlob(blob: Blob, fallbackName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadText(text: string, fileName: string, type = 'text/markdown;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), fileName);
}

function withAdminHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  const token = getAdminToken();
  if (token) next.set('x-easy-bidding-admin-token', token);
  return next;
}

async function adminJsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = withAdminHeaders(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const resp = await fetch(url, { ...init, headers });
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.message) detail = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  getAuthToken,
  clearAuthToken,
  getAdminToken,
  clearAdminToken,
  async register(email: string, password: string, displayName: string): Promise<AuthProfile> {
    const result = await jsonFetch<AuthResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    setAuthToken(result.token);
    return result.user;
  },
  async login(email: string, password: string): Promise<AuthProfile> {
    const result = await jsonFetch<AuthResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(result.token);
    return result.user;
  },
  async logout(): Promise<void> {
    try {
      await jsonFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      clearAuthToken();
    }
  },
  async getMe(): Promise<AuthMeResult> {
    if (!getAuthToken()) return { authenticated: false, user: null };
    return jsonFetch<AuthMeResult>('/api/auth/me');
  },
  async adminLogin(secret: string): Promise<AdminLoginResult> {
    const result = await jsonFetch<AdminLoginResult>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    });
    setAdminToken(result.token);
    return result;
  },
  async getAdminMe(): Promise<AdminMeResult> {
    if (!getAdminToken()) return { authenticated: false, role: null };
    return adminJsonFetch<AdminMeResult>('/api/admin/me');
  },
  adminLogout(): void {
    clearAdminToken();
  },

  getSettings(): Promise<RedactedAIConfig> {
    return adminJsonFetch<RedactedAIConfig>('/api/settings');
  },
  saveSettings(config: Partial<AIConfig>): Promise<RedactedAIConfig> {
    return adminJsonFetch<RedactedAIConfig>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },
  testConnection(config: Partial<AIConfig>): Promise<TestResult> {
    return adminJsonFetch<TestResult>('/api/settings/test', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  // ===== 额度账户 =====
  getBillingOverview(): Promise<BillingOverview> {
    return jsonFetch<BillingOverview>('/api/billing/account');
  },
  createRechargeOrder(credits: number, packageCode?: string): Promise<BillingOverview> {
    return jsonFetch<BillingOverview>('/api/billing/orders', {
      method: 'POST',
      body: JSON.stringify({ credits, packageCode, provider: 'manual' }),
    });
  },
  mockPayRechargeOrder(orderId: string): Promise<BillingOverview> {
    return jsonFetch<BillingOverview>(`/api/billing/orders/${orderId}/mock-pay`, {
      method: 'POST',
    });
  },
  cancelRechargeOrder(orderId: string): Promise<BillingOverview> {
    return jsonFetch<BillingOverview>(`/api/billing/orders/${orderId}/cancel`, {
      method: 'POST',
    });
  },
  rechargeCredits(credits: number, description?: string): Promise<BillingOverview> {
    return jsonFetch<BillingOverview>('/api/billing/recharge', {
      method: 'POST',
      body: JSON.stringify({ credits, description }),
    });
  },
  getAdminBillingOverview(): Promise<AdminBillingOverview> {
    return adminJsonFetch<AdminBillingOverview>('/api/billing/admin/overview');
  },
  adminAllocateCredits(accountId: string, credits: number, description: string): Promise<AdminBillingOverview> {
    return adminJsonFetch<AdminBillingOverview>('/api/billing/admin/allocate', {
      method: 'POST',
      body: JSON.stringify({ accountId, credits, description }),
    });
  },
  adminUpdateAccount(
    accountId: string,
    patch: {
      status?: BillingAccountStatus;
      adminNote?: string;
      name?: string;
      planCode?: BillingPlanCode;
      planName?: string;
      planExpiresAt?: string | null;
      projectLimit?: number;
      featureFlags?: Partial<BillingFeatureFlags>;
    },
  ): Promise<AdminBillingOverview> {
    return adminJsonFetch<AdminBillingOverview>(`/api/billing/admin/accounts/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  // ===== 项目 =====
  listProjects(): Promise<Project[]> {
    return jsonFetch<Project[]>('/api/projects');
  },
  createProject(name: string): Promise<Project> {
    return jsonFetch<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  renameProject(id: string, name: string): Promise<Project> {
    return jsonFetch<Project>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },
  deleteProject(id: string): Promise<{ ok: boolean }> {
    return jsonFetch<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
  },
  getTenderText(id: string): Promise<{ text: string }> {
    return jsonFetch<{ markdown: string }>(`/api/projects/${id}/tender-markdown`).then((res) => ({
      text: res.markdown,
    }));
  },
  getTenderMarkdown(id: string): Promise<{ markdown: string }> {
    return jsonFetch<{ markdown: string }>(`/api/projects/${id}/tender-markdown`);
  },
  async downloadTenderMarkdown(id: string, fallbackName: string): Promise<void> {
    const { markdown } = await jsonFetch<{ markdown: string }>(`/api/projects/${id}/tender-markdown`);
    downloadText(markdown, `${fallbackName}-招标文件.md`);
  },
  getOriginalPlanText(id: string): Promise<{ text: string }> {
    return jsonFetch<{ markdown: string }>(`/api/projects/${id}/original-plan-markdown`).then((res) => ({
      text: res.markdown,
    }));
  },
  getOriginalPlanMarkdown(id: string): Promise<{ markdown: string }> {
    return jsonFetch<{ markdown: string }>(`/api/projects/${id}/original-plan-markdown`);
  },
  async downloadOriginalPlanMarkdown(id: string, fallbackName: string): Promise<void> {
    const { markdown } = await jsonFetch<{ markdown: string }>(`/api/projects/${id}/original-plan-markdown`);
    downloadText(markdown, `${fallbackName}-已有方案.md`);
  },
  async uploadTender(id: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    const resp = await authFetch(`/api/projects/${id}/tender`, { method: 'POST', body: form });
    await throwIfNotOk(resp);
    return resp.json() as Promise<UploadResult>;
  },
  async uploadOriginalPlan(id: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    const resp = await authFetch(`/api/projects/${id}/original-plan`, { method: 'POST', body: form });
    await throwIfNotOk(resp);
    return resp.json() as Promise<UploadResult>;
  },
  deleteOriginalPlan(id: string): Promise<Project> {
    return jsonFetch<Project>(`/api/projects/${id}/original-plan`, { method: 'DELETE' });
  },
  detectBidSections(id: string): Promise<Project> {
    return jsonFetch<Project>(`/api/projects/${id}/bid-sections/detect`, { method: 'POST' });
  },
  selectBidSection(id: string, sectionId: string): Promise<Project> {
    return jsonFetch<Project>(`/api/projects/${id}/bid-sections/select`, {
      method: 'POST',
      body: JSON.stringify({ sectionId }),
    });
  },
  resetBidSection(id: string): Promise<Project> {
    return jsonFetch<Project>(`/api/projects/${id}/bid-sections/reset`, { method: 'POST' });
  },

  // ===== 招标文件关键项解析 =====
  getAnalysis(id: string): Promise<TenderAnalysis> {
    return jsonFetch<TenderAnalysis>(`/api/projects/${id}/analysis`);
  },
  generateAnalysis(id: string): Promise<TenderAnalysis> {
    return jsonFetch<TenderAnalysis>(`/api/projects/${id}/analysis/generate`, { method: 'POST' });
  },
  saveAnalysis(id: string, analysis: TenderAnalysis): Promise<TenderAnalysis> {
    return jsonFetch<TenderAnalysis>(`/api/projects/${id}/analysis`, {
      method: 'PUT',
      body: JSON.stringify(analysis),
    });
  },

  // ===== 招标书行业/采购类型画像 =====
  getIndustryProfile(id: string): Promise<TenderIndustryProfile> {
    return jsonFetch<TenderIndustryProfile>(`/api/projects/${id}/industry-profile`);
  },
  generateIndustryProfile(id: string): Promise<TenderIndustryProfile> {
    return jsonFetch<TenderIndustryProfile>(`/api/projects/${id}/industry-profile/generate`, {
      method: 'POST',
    });
  },

  // ===== 目录 =====
  getOutline(id: string): Promise<Outline> {
    return jsonFetch<Outline>(`/api/projects/${id}/outline`);
  },
  generateOutline(id: string): Promise<Outline> {
    return jsonFetch<Outline>(`/api/projects/${id}/outline/generate`, { method: 'POST' });
  },
  generateOutlineVariants(id: string): Promise<OutlineVariantsResult> {
    return jsonFetch<OutlineVariantsResult>(`/api/projects/${id}/outline/variants`, { method: 'POST' });
  },
  saveOutline(id: string, outline: Outline, options?: { clearResponseMatrix?: boolean }): Promise<Outline> {
    return jsonFetch<Outline>(`/api/projects/${id}/outline`, {
      method: 'PUT',
      body: JSON.stringify({ ...outline, clearResponseMatrix: options?.clearResponseMatrix }),
    });
  },

  // ===== 全局事实 =====
  getGlobalFacts(id: string): Promise<GlobalFacts> {
    return jsonFetch<GlobalFacts>(`/api/projects/${id}/global-facts`);
  },
  generateGlobalFacts(id: string): Promise<GlobalFacts> {
    return jsonFetch<GlobalFacts>(`/api/projects/${id}/global-facts/generate`, {
      method: 'POST',
    });
  },
  saveGlobalFacts(id: string, facts: GlobalFacts): Promise<GlobalFacts> {
    return jsonFetch<GlobalFacts>(`/api/projects/${id}/global-facts`, {
      method: 'PUT',
      body: JSON.stringify(facts),
    });
  },

  // ===== 点对点响应矩阵 =====
  getResponseMatrix(id: string): Promise<ResponseMatrix> {
    return jsonFetch<ResponseMatrix>(`/api/projects/${id}/response-matrix`);
  },
  generateResponseMatrix(id: string): Promise<ResponseMatrix> {
    return jsonFetch<ResponseMatrix>(`/api/projects/${id}/response-matrix/generate`, {
      method: 'POST',
    });
  },

  // ===== 商务/技术偏离表 =====
  getDeviationTable(id: string): Promise<DeviationTable> {
    return jsonFetch<DeviationTable>(`/api/projects/${id}/deviation-table`);
  },
  generateDeviationTable(id: string): Promise<DeviationTable> {
    return jsonFetch<DeviationTable>(`/api/projects/${id}/deviation-table/generate`, {
      method: 'POST',
    });
  },

  // ===== 客户资料补齐清单 =====
  getMaterialChecklist(id: string): Promise<ProjectMaterialChecklist> {
    return jsonFetch<ProjectMaterialChecklist>(`/api/projects/${id}/material-checklist`);
  },
  generateMaterialChecklist(id: string): Promise<ProjectMaterialChecklist> {
    return jsonFetch<ProjectMaterialChecklist>(`/api/projects/${id}/material-checklist/generate`, {
      method: 'POST',
    });
  },
  async uploadMaterialFile(id: string, itemId: string, file: File): Promise<ProjectMaterialChecklist> {
    const form = new FormData();
    form.append('file', file);
    const resp = await authFetch(`/api/projects/${id}/material-checklist/${itemId}/files`, {
      method: 'POST',
      body: form,
    });
    await throwIfNotOk(resp);
    return resp.json() as Promise<ProjectMaterialChecklist>;
  },
  deleteMaterialFile(id: string, itemId: string, fileId: string): Promise<ProjectMaterialChecklist> {
    return jsonFetch<ProjectMaterialChecklist>(`/api/projects/${id}/material-checklist/${itemId}/files/${fileId}`, {
      method: 'DELETE',
    });
  },

  // ===== 全文一致性审计 =====
  getConsistencyAudit(id: string): Promise<ConsistencyAudit> {
    return jsonFetch<ConsistencyAudit>(`/api/projects/${id}/consistency-audit`);
  },
  runConsistencyAudit(id: string): Promise<ConsistencyAudit> {
    return jsonFetch<ConsistencyAudit>(`/api/projects/${id}/consistency-audit/run`, {
      method: 'POST',
    });
  },

  // ===== 提交前总检 =====
  getBidReadiness(id: string): Promise<BidReadinessReport> {
    return jsonFetch<BidReadinessReport>(`/api/projects/${id}/bid-readiness`);
  },
  runBidReadiness(id: string): Promise<BidReadinessReport> {
    return jsonFetch<BidReadinessReport>(`/api/projects/${id}/bid-readiness/run`, {
      method: 'POST',
    });
  },

  // ===== 正文 =====
  generateSection(
    id: string,
    nodeId: string,
  ): Promise<{ nodeId: string; title: string; content: string }> {
    return jsonFetch(`/api/projects/${id}/content/generate-section`, {
      method: 'POST',
      body: JSON.stringify({ nodeId }),
    });
  },

  // ===== 导出 =====
  async downloadDocx(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/docx`);
    await downloadFromResponse(resp, `${fallbackName}.docx`);
  },
  async downloadMarkdown(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/markdown`);
    await downloadFromResponse(resp, `${fallbackName}.md`);
  },
  async downloadPdf(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/pdf`);
    await downloadFromResponse(resp, `${fallbackName}.pdf`);
  },
  async downloadStampedPdf(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/stamped-pdf`);
    await downloadFromResponse(resp, `${fallbackName}-盖章版.pdf`);
  },
  async downloadResponseMatrixMarkdown(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/workbench/response-matrix.md`);
    await downloadFromResponse(resp, `${fallbackName}-响应矩阵.md`);
  },
  async downloadResponseMatrixCsv(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/workbench/response-matrix.csv`);
    await downloadFromResponse(resp, `${fallbackName}-响应矩阵.csv`);
  },
  async downloadDeviationTableMarkdown(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/workbench/deviation-table.md`);
    await downloadFromResponse(resp, `${fallbackName}-偏离表.md`);
  },
  async downloadDeviationTableCsv(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/workbench/deviation-table.csv`);
    await downloadFromResponse(resp, `${fallbackName}-偏离表.csv`);
  },
  async downloadMaterialChecklistMarkdown(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/workbench/material-checklist.md`);
    await downloadFromResponse(resp, `${fallbackName}-资料清单.md`);
  },
  async downloadMaterialChecklistCsv(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/workbench/material-checklist.csv`);
    await downloadFromResponse(resp, `${fallbackName}-资料清单.csv`);
  },
  async downloadBidReadinessMarkdown(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/workbench/bid-readiness.md`);
    await downloadFromResponse(resp, `${fallbackName}-提交前总检.md`);
  },
  async downloadBidReadinessCsv(id: string, fallbackName: string): Promise<void> {
    const resp = await authFetch(`/api/projects/${id}/export/workbench/bid-readiness.csv`);
    await downloadFromResponse(resp, `${fallbackName}-提交前总检.csv`);
  },
  getSealState(id: string): Promise<SealState> {
    return jsonFetch<SealState>(`/api/projects/${id}/seal`);
  },
  async fetchSealImage(id: string): Promise<Blob> {
    const resp = await authFetch(`/api/projects/${id}/seal/image`);
    await throwIfNotOk(resp);
    return resp.blob();
  },
  async uploadSeal(id: string, file: File): Promise<SealState> {
    const form = new FormData();
    form.append('file', file);
    const resp = await authFetch(`/api/projects/${id}/seal`, { method: 'POST', body: form });
    await throwIfNotOk(resp);
    return resp.json() as Promise<SealState>;
  },
  deleteSeal(id: string): Promise<SealState> {
    return jsonFetch<SealState>(`/api/projects/${id}/seal`, { method: 'DELETE' });
  },
  saveSealPlacements(id: string, placements: SealPlacement[]): Promise<SealState> {
    return jsonFetch<SealState>(`/api/projects/${id}/seal/placements`, {
      method: 'PUT',
      body: JSON.stringify({ placements }),
    });
  },

  // ===== 标书查重 =====
  async runDuplicateCheck(tender: File | null, bids: File[]): Promise<DuplicateCheckResult> {
    const form = new FormData();
    if (tender) form.append('tender', tender);
    for (const file of bids) form.append('bids', file);
    const resp = await authFetch('/api/checks/duplicate', { method: 'POST', body: form });
    await throwIfNotOk(resp);
    return resp.json() as Promise<DuplicateCheckResult>;
  },
  async runRejectionCheck(tender: File, bid: File): Promise<RejectionCheckResult> {
    const form = new FormData();
    form.append('tender', tender);
    form.append('bid', bid);
    const resp = await authFetch('/api/checks/rejection', { method: 'POST', body: form });
    await throwIfNotOk(resp);
    return resp.json() as Promise<RejectionCheckResult>;
  },

  // ===== 知识库 =====
  getKnowledgeOverview(): Promise<KnowledgeOverview> {
    return jsonFetch<KnowledgeOverview>('/api/knowledge');
  },
  createKnowledgeFolder(name: string): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> {
    return jsonFetch('/api/knowledge/folders', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  deleteKnowledgeFolder(id: string): Promise<{ ok: boolean }> {
    return jsonFetch(`/api/knowledge/folders/${id}`, { method: 'DELETE' });
  },
  async uploadKnowledgeDocument(folderId: string, file: File): Promise<KnowledgeUploadResult> {
    const form = new FormData();
    form.append('folderId', folderId);
    form.append('file', file);
    const resp = await authFetch('/api/knowledge/documents', { method: 'POST', body: form });
    await throwIfNotOk(resp);
    return resp.json() as Promise<KnowledgeUploadResult>;
  },
  deleteKnowledgeDocument(id: string): Promise<{ ok: boolean }> {
    return jsonFetch(`/api/knowledge/documents/${id}`, { method: 'DELETE' });
  },
  analyzeKnowledgeDocument(id: string): Promise<KnowledgeOverview> {
    return jsonFetch<{ overview: KnowledgeOverview }>(`/api/knowledge/documents/${id}/analyze`, {
      method: 'POST',
    }).then((res) => res.overview);
  },
  deleteKnowledgeItem(id: string): Promise<{ ok: boolean }> {
    return jsonFetch(`/api/knowledge/items/${id}`, { method: 'DELETE' });
  },
};
