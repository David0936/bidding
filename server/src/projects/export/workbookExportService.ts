import type { DeviationTable, DeviationTableItem } from '../deviationTable/types.js';
import type { ProjectMaterialChecklist, ProjectMaterialItem } from '../materialChecklist/types.js';
import type { BidReadinessReport } from '../readiness/types.js';
import type { ResponseMatrix, ResponseMatrixItem } from '../responseMatrix/types.js';

const RESPONSE_CATEGORY_LABELS: Record<ResponseMatrixItem['category'], string> = {
  qualification: '资格',
  business: '商务',
  technical: '技术',
  scoring: '评分',
  rejection: '废标',
  delivery: '交付',
  service: '服务',
  price: '报价',
  other: '其他',
};

const RESPONSE_OWNER_LABELS: Record<ResponseMatrixItem['ownerRole'], string> = {
  business: '商务',
  technical: '技术',
  finance: '财务',
  project_manager: '项目经理',
  product: '产品',
  legal: '法务',
  admin: '综合',
};

const RESPONSE_STATUS_LABELS: Record<ResponseMatrixItem['status'], string> = {
  covered: '已覆盖',
  partial: '部分覆盖',
  missing: '未覆盖',
  risk: '有风险',
  not_applicable: '不适用',
};

const RESPONSE_PRIORITY_LABELS: Record<ResponseMatrixItem['priority'], string> = {
  critical: '关键',
  high: '高',
  medium: '中',
  low: '低',
};

const DEVIATION_SCOPE_LABELS: Record<DeviationTableItem['scope'], string> = {
  business: '商务',
  technical: '技术',
};

const DEVIATION_TYPE_LABELS: Record<DeviationTableItem['deviationType'], string> = {
  no_deviation: '无偏离',
  positive: '正偏离',
  negative: '负偏离',
  pending: '待确认',
  not_applicable: '不适用',
};

const MATERIAL_CATEGORY_LABELS: Record<ProjectMaterialItem['category'], string> = {
  qualification: '资质',
  business: '商务',
  technical: '技术',
  financial: '财务',
  legal: '法务',
  personnel: '人员',
  performance: '业绩',
  price: '报价',
  seal: '签章',
  other: '其他',
};

const MATERIAL_OWNER_LABELS: Record<ProjectMaterialItem['ownerRole'], string> = {
  business: '商务',
  technical: '技术',
  finance: '财务',
  project_manager: '项目经理',
  product: '产品',
  legal: '法务',
  admin: '综合',
};

const MATERIAL_STATUS_LABELS: Record<ProjectMaterialItem['status'], string> = {
  pending: '待上传',
  uploaded: '已上传',
  needs_review: '待复核',
  not_required: '非必需',
};

const READINESS_LEVEL_LABELS: Record<BidReadinessReport['level'], string> = {
  ready: '可进入定稿',
  attention: '需复核',
  blocked: '暂不建议提交',
};

const READINESS_SEVERITY_LABELS: Record<BidReadinessReport['issues'][number]['severity'], string> = {
  blocker: '阻断',
  high: '高风险',
  medium: '需注意',
  low: '建议',
};

const READINESS_CATEGORY_LABELS: Record<BidReadinessReport['issues'][number]['category'], string> = {
  workflow: '流程',
  response: '响应',
  materials: '资料',
  content: '正文',
  consistency: '一致性',
  seal: '盖章',
  export: '导出',
};

function compact(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function markdownCell(value: unknown): string {
  const text = compact(value).replace(/\|/g, '\\|');
  return text || '-';
}

function renderMarkdownTable(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0) return '_暂无数据。_';
  const head = `| ${headers.map(markdownCell).join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`);
  return [head, divider, ...body].join('\n');
}

function csvCell(value: unknown): string {
  const text = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderCsv(headers: string[], rows: unknown[][]): string {
  return [[...headers], ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function responseRows(matrix: ResponseMatrix): unknown[][] {
  return matrix.items.map((item, index) => [
    index + 1,
    RESPONSE_CATEGORY_LABELS[item.category],
    RESPONSE_PRIORITY_LABELS[item.priority],
    RESPONSE_STATUS_LABELS[item.status],
    RESPONSE_OWNER_LABELS[item.ownerRole],
    item.requirement,
    item.responseStrategy,
    item.evidence,
    item.suggestedSection,
    [item.gap, item.risk].filter(Boolean).join('；'),
    item.score,
    item.sourceClause,
  ]);
}

export function buildResponseMatrixMarkdown(matrix: ResponseMatrix): string {
  const headers = ['序号', '类别', '优先级', '状态', '责任角色', '需求/条款', '响应策略', '证据/材料', '建议章节', '缺口/风险', '评分', '来源'];
  return [
    '# 点对点响应矩阵',
    `生成时间：${formatDateTime(matrix.generatedAt)}`,
    '',
    matrix.summary,
    '',
    renderMarkdownTable(headers, responseRows(matrix)),
    '',
  ].join('\n');
}

export function buildResponseMatrixCsv(matrix: ResponseMatrix): string {
  const headers = ['序号', '类别', '优先级', '状态', '责任角色', '需求/条款', '响应策略', '证据/材料', '建议章节', '缺口/风险', '评分', '来源'];
  return renderCsv(headers, responseRows(matrix));
}

function deviationRows(table: DeviationTable): unknown[][] {
  return table.items.map((item, index) => [
    index + 1,
    DEVIATION_SCOPE_LABELS[item.scope],
    DEVIATION_TYPE_LABELS[item.deviationType],
    RESPONSE_PRIORITY_LABELS[item.priority],
    item.requirement,
    item.response,
    item.deviationDescription,
    item.handlingSuggestion,
    item.suggestedSection,
    item.risk,
    item.sourceClause,
    item.sourceResponseId,
  ]);
}

export function buildDeviationTableMarkdown(table: DeviationTable): string {
  const headers = ['序号', '范围', '偏离类型', '优先级', '招标要求', '投标响应', '偏离说明', '处理建议', '建议章节', '风险', '来源条款', '矩阵项'];
  return [
    '# 商务/技术偏离表',
    `生成时间：${formatDateTime(table.generatedAt)}`,
    `更新时间：${formatDateTime(table.updatedAt)}`,
    '',
    table.summary,
    '',
    renderMarkdownTable(headers, deviationRows(table)),
    '',
  ].join('\n');
}

export function buildDeviationTableCsv(table: DeviationTable): string {
  const headers = ['序号', '范围', '偏离类型', '优先级', '招标要求', '投标响应', '偏离说明', '处理建议', '建议章节', '风险', '来源条款', '矩阵项'];
  return renderCsv(headers, deviationRows(table));
}

function materialFileText(item: ProjectMaterialItem): string {
  if (item.files.length === 0) return '';
  return item.files
    .map((file) => `${file.fileName}（${file.fileType}，${file.charCount} 字，${formatDateTime(file.uploadedAt)}）`)
    .join('；');
}

function materialRows(checklist: ProjectMaterialChecklist): unknown[][] {
  return checklist.items.map((item, index) => [
    index + 1,
    MATERIAL_CATEGORY_LABELS[item.category],
    item.required ? '必需' : '可选',
    MATERIAL_STATUS_LABELS[item.status],
    MATERIAL_OWNER_LABELS[item.ownerRole],
    item.title,
    item.purpose,
    item.description,
    materialFileText(item),
    item.suggestedSection,
    item.sourceClause,
    item.acceptedFileTypes.join(' / '),
    item.uploadTips,
  ]);
}

export function buildMaterialChecklistMarkdown(checklist: ProjectMaterialChecklist): string {
  const headers = ['序号', '类别', '是否必需', '状态', '责任角色', '材料名称', '用途', '说明', '已上传文件', '建议章节', '来源条款', '接收格式', '上传提示'];
  return [
    '# 客户资料补齐清单',
    `生成时间：${formatDateTime(checklist.generatedAt)}`,
    `更新时间：${formatDateTime(checklist.updatedAt)}`,
    '',
    checklist.summary,
    '',
    renderMarkdownTable(headers, materialRows(checklist)),
    '',
  ].join('\n');
}

export function buildMaterialChecklistCsv(checklist: ProjectMaterialChecklist): string {
  const headers = ['序号', '类别', '是否必需', '状态', '责任角色', '材料名称', '用途', '说明', '已上传文件', '建议章节', '来源条款', '接收格式', '上传提示'];
  return renderCsv(headers, materialRows(checklist));
}

function readinessMetricRows(report: BidReadinessReport): unknown[][] {
  return [
    ['总分', report.metrics.score],
    ['响应缺口', `${report.metrics.responseOpen}/${report.metrics.responseTotal}`],
    ['关键响应缺口', report.metrics.responseCriticalOpen],
    ['必需资料', `${report.metrics.uploadedRequiredMaterials}/${report.metrics.requiredMaterials}`],
    ['正文完成', `${report.metrics.generatedContentSections}/${report.metrics.contentSections}`],
    ['一致性问题', `${report.metrics.highConsistencyIssues}/${report.metrics.consistencyIssues}`],
    ['盖章位置', report.metrics.sealPlacements],
  ];
}

function readinessIssueRows(report: BidReadinessReport): unknown[][] {
  return report.issues.map((issue, index) => [
    index + 1,
    READINESS_SEVERITY_LABELS[issue.severity],
    READINESS_CATEGORY_LABELS[issue.category],
    issue.title,
    issue.detail,
    issue.action,
    issue.source,
  ]);
}

export function buildBidReadinessMarkdown(report: BidReadinessReport): string {
  return [
    '# 提交前总检',
    `生成时间：${formatDateTime(report.generatedAt)}`,
    `状态：${READINESS_LEVEL_LABELS[report.level]} · ${report.score} 分`,
    '',
    report.summary,
    '',
    '## 指标',
    renderMarkdownTable(['指标', '数值'], readinessMetricRows(report)),
    '',
    '## 问题清单',
    renderMarkdownTable(['序号', '严重程度', '类别', '标题', '详情', '处理动作', '来源'], readinessIssueRows(report)),
    '',
  ].join('\n');
}

export function buildBidReadinessCsv(report: BidReadinessReport): string {
  const rows: unknown[][] = [
    ['总检', '提交状态', READINESS_LEVEL_LABELS[report.level], '总分', report.score, report.summary, ''],
    ...readinessMetricRows(report).map(([title, value]) => ['指标', '', '', title, value, '', '']),
    ...readinessIssueRows(report).map(([index, severity, category, title, detail, action, source]) => [
      '问题',
      index,
      severity,
      category,
      title,
      `${detail}；处理动作：${action}`,
      source,
    ]),
  ];
  return renderCsv(['类型', '序号/分组', '严重程度/状态', '类别/指标', '标题/指标', '详情/数值', '来源'], rows);
}
