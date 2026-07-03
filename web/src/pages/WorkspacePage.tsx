// 标书工作台：管理项目 + 主链路步骤。当前实现 Step1（上传解析招标文件）。
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api } from '../api';
import type {
  BidReadinessReport,
  ConsistencyAudit,
  DeviationTable,
  DeviationTableItem,
  GlobalFacts,
  Outline,
  OutlineVariant,
  Project,
  ProjectMaterialChecklist,
  ProjectMaterialItem,
  ResponseMatrix,
  ResponseMatrixItem,
  SealPlacement,
  SealState,
  TenderAnalysis,
  TenderIndustryProfile,
} from '../types';
import OutlineEditor from '../components/OutlineEditor';
import ContentEditor from '../components/ContentEditor';
import { countGenerated } from '../lib/outlineTree';
import {
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconUploadCloud,
  IconCheckCircle,
  IconEye,
  IconPen,
  IconSettings,
  IconDownload,
  IconChevronRight,
  IconSave,
} from '../components/Icons';

const FACT_CATEGORIES = ['项目', '甲方', '交付', '服务', '资质', '金额', '评分', '风险', '其他'];

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

const INDUSTRY_LABELS: Record<TenderIndustryProfile['industry'], string> = {
  software_it: '软件信息化',
  power_energy: '电力能源',
  construction_infrastructure: '建筑基建',
  municipal_transport: '市政交通',
  water_conservancy: '水利水务',
  security_weak_current: '安防弱电',
  medical_education: '医疗教育',
  environmental_sanitation: '环保环卫',
  property_logistics: '物业物流',
  industrial_manufacturing: '工业制造',
  chemical_hazardous: '化工危化',
  mining: '矿山资源',
  government_consulting: '政务咨询',
  general_procurement: '通用采购',
  other: '其他行业',
};

const PROCUREMENT_TYPE_LABELS: Record<TenderIndustryProfile['procurementType'], string> = {
  engineering: '工程类',
  goods: '货物类',
  service: '服务类',
  software: '软件类',
  equipment: '设备类',
  epc: 'EPC/总承包',
  operation: '运营维护类',
  consulting: '咨询类',
  mixed: '综合类',
  other: '其他',
};

const CONFIDENCE_LABELS: Record<TenderIndustryProfile['confidence'], string> = {
  high: '高置信',
  medium: '中置信',
  low: '低置信',
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

type WorkbookExportKind =
  | 'response-md'
  | 'response-csv'
  | 'deviation-md'
  | 'deviation-csv'
  | 'materials-md'
  | 'materials-csv'
  | 'readiness-md'
  | 'readiness-csv';

type AutoIntakeStage = 'idle' | 'uploading' | 'analysis' | 'industry' | 'done' | 'error';

const AUTO_INTAKE_STEPS: Array<{ stage: AutoIntakeStage; label: string }> = [
  { stage: 'uploading', label: '上传解析' },
  { stage: 'analysis', label: '需求明细' },
  { stage: 'industry', label: '行业判断' },
];

const AUTO_INTAKE_STAGE_INDEX: Record<AutoIntakeStage, number> = {
  idle: -1,
  uploading: 0,
  analysis: 1,
  industry: 2,
  done: AUTO_INTAKE_STEPS.length,
  error: -1,
};

const AUTO_INTAKE_STAGE_LABELS: Record<AutoIntakeStage, string> = {
  idle: '待上传',
  uploading: '上传解析中',
  analysis: '提取需求中',
  industry: '识别行业中',
  done: '自动解析完成',
  error: '需手动处理',
};

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function collectOutlineLeafStats(nodes: Outline['nodes']): { leafCount: number; estimatedWords: number } {
  return nodes.reduce(
    (acc, node) => {
      if (node.children.length === 0) {
        acc.leafCount += 1;
        acc.estimatedWords += Math.max(0, Number(node.estimatedWords ?? 0));
        return acc;
      }
      const child = collectOutlineLeafStats(node.children);
      acc.leafCount += child.leafCount;
      acc.estimatedWords += child.estimatedWords;
      return acc;
    },
    { leafCount: 0, estimatedWords: 0 },
  );
}

function newPlacementId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `seal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function InfoGrid({ title, data }: { title: string; data: Record<string, string> }) {
  const entries = Object.entries(data).filter(([, value]) => value.trim());
  if (entries.length === 0) return null;
  return (
    <div className="info-block">
      <h3>{title}</h3>
      <div className="info-grid">
        {entries.map(([key, value]) => (
          <div className="info-cell" key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RequirementList({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; detail: string; category?: string; score?: string; source?: string; kind?: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="info-block">
      <h3>{title}</h3>
      <div className="requirement-list">
        {items.map((item, idx) => (
          <div className="requirement-item" key={`${item.title}-${idx}`}>
            <div className="requirement-title">
              <strong>{item.title}</strong>
              {(item.category || item.kind || item.score) && (
                <span className="badge badge-off">
                  {[item.category, item.kind, item.score].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <p>{item.detail}</p>
            {item.source && <span className="muted">依据：{item.source}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FactsEditor({
  facts,
  onChange,
}: {
  facts: GlobalFacts;
  onChange: (facts: GlobalFacts) => void;
}) {
  function patchItem(index: number, patch: Partial<GlobalFacts['items'][number]>) {
    onChange({
      ...facts,
      items: facts.items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    });
  }

  function removeItem(index: number) {
    onChange({ ...facts, items: facts.items.filter((_, idx) => idx !== index) });
  }

  function addItem() {
    const next = facts.items.length + 1;
    onChange({
      ...facts,
      items: [
        ...facts.items,
        {
          id: `F${String(next).padStart(3, '0')}`,
          category: '其他',
          title: '新事实',
          value: '',
        },
      ],
    });
  }

  return (
    <div className="facts-editor">
      {facts.items.map((item, idx) => (
        <div className="fact-item" key={`${item.id}-${idx}`}>
          <div className="fact-head">
            <span className="content-idx">{idx + 1}</span>
            <select
              value={item.category}
              onChange={(e) => patchItem(idx, { category: e.target.value })}
            >
              {FACT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input
              value={item.title}
              onChange={(e) => patchItem(idx, { title: e.target.value })}
              placeholder="事实标题"
            />
            <button className="mini-btn danger" onClick={() => removeItem(idx)}>
              <IconTrash />
            </button>
          </div>
          <textarea
            value={item.value}
            onChange={(e) => patchItem(idx, { value: e.target.value })}
            placeholder="必须保持一致的事实内容"
          />
          <input
            value={item.source ?? ''}
            onChange={(e) => patchItem(idx, { source: e.target.value })}
            placeholder="依据原文，可选"
          />
          <input
            value={item.notes ?? ''}
            onChange={(e) => patchItem(idx, { notes: e.target.value })}
            placeholder="写作提示，可选"
          />
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={addItem}>
        <IconPlus />
        添加事实
      </button>
    </div>
  );
}

function AuditPanel({ audit }: { audit: ConsistencyAudit }) {
  return (
    <div className="audit-panel">
      <div className="analysis-summary">
        <strong>审计摘要</strong>
        <p>{audit.summary}</p>
      </div>
      {audit.issues.length === 0 ? (
        <div className="empty-tip">未发现明显一致性问题。</div>
      ) : (
        <div className="requirement-list">
          {audit.issues.map((issue) => (
            <div className="requirement-item" key={issue.id}>
              <div className="requirement-title">
                <strong>{issue.path.join(' / ')}</strong>
                <span className={`badge ${issue.severity === 'high' ? 'badge-warn' : 'badge-off'}`}>
                  {issue.severity}
                </span>
              </div>
              {issue.factTitle && <span className="muted">关联事实：{issue.factTitle}</span>}
              <p>{issue.problem}</p>
              {issue.quote && <pre className="audit-quote">{issue.quote}</pre>}
              <p>
                <strong>建议：</strong>
                {issue.suggestion}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function readinessLevelBadge(level: BidReadinessReport['level']) {
  if (level === 'ready') return 'badge-on';
  if (level === 'blocked') return 'badge-warn';
  return 'badge-off';
}

function readinessSeverityBadge(severity: BidReadinessReport['issues'][number]['severity']) {
  if (severity === 'blocker' || severity === 'high') return 'badge-warn';
  return 'badge-off';
}

function ReadinessPanel({ report }: { report: BidReadinessReport }) {
  const metrics = [
    { label: '总分', value: `${report.metrics.score}` },
    {
      label: '响应缺口',
      value: `${report.metrics.responseOpen}/${report.metrics.responseTotal}`,
    },
    {
      label: '必需资料',
      value: `${report.metrics.uploadedRequiredMaterials}/${report.metrics.requiredMaterials}`,
    },
    {
      label: '正文完成',
      value: `${report.metrics.generatedContentSections}/${report.metrics.contentSections}`,
    },
    {
      label: '一致性问题',
      value: `${report.metrics.highConsistencyIssues}/${report.metrics.consistencyIssues}`,
    },
    {
      label: '盖章位置',
      value: `${report.metrics.sealPlacements}`,
    },
  ];

  return (
    <div className="readiness-panel">
      <div className="readiness-summary">
        <div>
          <span>提交前总检</span>
          <strong>{report.score}</strong>
        </div>
        <div className="readiness-summary-body">
          <span className={`badge ${readinessLevelBadge(report.level)}`}>
            {READINESS_LEVEL_LABELS[report.level]}
          </span>
          <p>{report.summary}</p>
        </div>
      </div>

      <div className="readiness-metrics">
        {metrics.map((item) => (
          <div className="metric-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      {report.issues.length === 0 ? (
        <div className="empty-tip">未发现提交前阻断问题。</div>
      ) : (
        <div className="readiness-issue-list">
          {report.issues.map((item) => (
            <div className="readiness-issue" key={item.id}>
              <div className="response-matrix-head">
                <span className={`badge ${readinessSeverityBadge(item.severity)}`}>
                  {READINESS_SEVERITY_LABELS[item.severity]}
                </span>
                <span className="badge badge-off">{READINESS_CATEGORY_LABELS[item.category]}</span>
                {item.source && <span className="badge badge-off">{item.source}</span>}
              </div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <p>
                <strong>处理：</strong>
                {item.action}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function industryConfidenceBadge(confidence: TenderIndustryProfile['confidence']) {
  if (confidence === 'high') return 'badge-on';
  if (confidence === 'low') return 'badge-warn';
  return 'badge-off';
}

function IndustryProfilePanel({ profile }: { profile: TenderIndustryProfile }) {
  const focusGroups = [
    { title: '资料重点', items: profile.materialHints },
    { title: '响应重点', items: profile.responseFocus },
    { title: '风险重点', items: profile.riskFocus },
    { title: '结构提示', items: profile.templateHints },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="industry-profile-panel">
      <div className="analysis-summary">
        <div className="industry-profile-head">
          <strong>{profile.title}</strong>
          <div className="industry-badges">
            <span className="badge badge-on">{INDUSTRY_LABELS[profile.industry]}</span>
            <span className="badge badge-off">{PROCUREMENT_TYPE_LABELS[profile.procurementType]}</span>
            <span className={`badge ${industryConfidenceBadge(profile.confidence)}`}>
              {CONFIDENCE_LABELS[profile.confidence]}
            </span>
          </div>
        </div>
        <p>{profile.reasoning}</p>
      </div>

      {profile.keywords.length > 0 && (
        <div className="industry-keywords">
          {profile.keywords.map((keyword) => (
            <span className="badge badge-off" key={keyword}>
              {keyword}
            </span>
          ))}
        </div>
      )}

      <div className="industry-focus-grid">
        {focusGroups.map((group) => (
          <div className="industry-focus-card" key={group.title}>
            <h3>{group.title}</h3>
            <div className="focus-list">
              {group.items.map((item, idx) => (
                <span key={`${group.title}-${idx}`}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutlineVariantsPanel({
  variants,
  selectedId,
  onSelect,
}: {
  variants: OutlineVariant[];
  selectedId: string;
  onSelect: (variant: OutlineVariant) => void;
}) {
  return (
    <div className="outline-variant-grid">
      {variants.map((variant) => {
        const stats = collectOutlineLeafStats(variant.outline.nodes);
        return (
          <div className="outline-variant-card" data-selected={selectedId === variant.id} key={variant.id}>
            <div className="outline-variant-head">
              <div>
                <strong>{variant.name}</strong>
                <p>{variant.summary}</p>
              </div>
              <button className="mini-btn" onClick={() => onSelect(variant)}>
                <IconCheckCircle />
                选择方案
              </button>
            </div>
            <div className="outline-variant-meta">
              <span>{variant.outline.nodes.length} 章</span>
              <span>{stats.leafCount} 节</span>
              {stats.estimatedWords > 0 && <span>约 {stats.estimatedWords.toLocaleString()} 字</span>}
            </div>
            <div className="outline-variant-preview">
              {variant.outline.nodes.slice(0, 5).map((node) => (
                <div key={node.id}>
                  <strong>{node.title}</strong>
                  {node.children.slice(0, 3).map((child) => (
                    <span key={child.id}>{child.title}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function responseStatusBadge(status: ResponseMatrixItem['status']) {
  if (status === 'covered') return 'badge-on';
  if (status === 'not_applicable') return 'badge-off';
  return 'badge-warn';
}

function deviationTypeBadge(type: DeviationTableItem['deviationType']) {
  if (type === 'no_deviation' || type === 'positive') return 'badge-on';
  if (type === 'pending' || type === 'negative') return 'badge-warn';
  return 'badge-off';
}

function DeviationTablePanel({ table }: { table: DeviationTable }) {
  const pendingCount = table.items.filter((item) => item.deviationType === 'pending').length;
  const noDeviationCount = table.items.filter((item) => item.deviationType === 'no_deviation').length;
  const technicalCount = table.items.filter((item) => item.scope === 'technical').length;
  const businessCount = table.items.filter((item) => item.scope === 'business').length;

  return (
    <div className="deviation-panel">
      <div className="analysis-summary">
        <strong>偏离表摘要</strong>
        <p>{table.summary}</p>
      </div>
      <div className="response-matrix-metrics">
        <div className="metric-card">
          <span>偏离项</span>
          <strong>{table.items.length}</strong>
        </div>
        <div className="metric-card">
          <span>无偏离</span>
          <strong>{noDeviationCount}</strong>
        </div>
        <div className="metric-card">
          <span>待确认</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="metric-card">
          <span>商务/技术</span>
          <strong>{businessCount}/{technicalCount}</strong>
        </div>
      </div>
      <div className="deviation-list">
        {table.items.map((item) => (
          <div className="deviation-item" key={item.id}>
            <div className="response-matrix-head">
              <span className={`badge ${deviationTypeBadge(item.deviationType)}`}>
                {DEVIATION_TYPE_LABELS[item.deviationType]}
              </span>
              <span className="badge badge-off">{DEVIATION_SCOPE_LABELS[item.scope]}</span>
              <span className={`badge ${item.priority === 'critical' ? 'badge-warn' : 'badge-off'}`}>
                {RESPONSE_PRIORITY_LABELS[item.priority]}
              </span>
              {item.sourceResponseId && <span className="badge badge-off">{item.sourceResponseId}</span>}
            </div>
            <strong>{item.requirement}</strong>
            {item.sourceClause && <span className="muted">依据：{item.sourceClause}</span>}
            <p>
              <strong>响应：</strong>
              {item.response}
            </p>
            <p>
              <strong>偏离说明：</strong>
              {item.deviationDescription}
            </p>
            <p>
              <strong>处理：</strong>
              {item.handlingSuggestion}
            </p>
            {item.suggestedSection && (
              <p>
                <strong>建议落点：</strong>
                {item.suggestedSection}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResponseMatrixPanel({ matrix }: { matrix: ResponseMatrix }) {
  const criticalCount = matrix.items.filter((item) => item.priority === 'critical').length;
  const gapCount = matrix.items.filter((item) => ['missing', 'partial', 'risk'].includes(item.status)).length;
  const coveredCount = matrix.items.filter((item) => item.status === 'covered').length;

  return (
    <div className="response-matrix-panel">
      <div className="analysis-summary">
        <strong>响应总览</strong>
        <p>{matrix.summary}</p>
      </div>
      <div className="response-matrix-metrics">
        <div className="metric-card">
          <span>响应项</span>
          <strong>{matrix.items.length}</strong>
        </div>
        <div className="metric-card">
          <span>关键项</span>
          <strong>{criticalCount}</strong>
        </div>
        <div className="metric-card">
          <span>需补齐</span>
          <strong>{gapCount}</strong>
        </div>
        <div className="metric-card">
          <span>已覆盖</span>
          <strong>{coveredCount}</strong>
        </div>
      </div>
      <div className="response-matrix-list">
        {matrix.items.map((item) => (
          <div className="response-matrix-item" key={item.id}>
            <div className="response-matrix-head">
              <span className={`badge ${responseStatusBadge(item.status)}`}>{RESPONSE_STATUS_LABELS[item.status]}</span>
              <span className={`badge ${item.priority === 'critical' ? 'badge-warn' : 'badge-off'}`}>
                {RESPONSE_PRIORITY_LABELS[item.priority]}
              </span>
              <span className="badge badge-off">{RESPONSE_CATEGORY_LABELS[item.category]}</span>
              <span className="badge badge-off">{RESPONSE_OWNER_LABELS[item.ownerRole]}</span>
              {item.score && <span className="badge badge-off">{item.score}</span>}
            </div>
            <strong>{item.requirement}</strong>
            {item.sourceClause && <span className="muted">依据：{item.sourceClause}</span>}
            <p>{item.responseStrategy}</p>
            {item.suggestedSection && (
              <p>
                <strong>落点：</strong>
                {item.suggestedSection}
              </p>
            )}
            {item.evidence && <pre className="audit-quote">{item.evidence}</pre>}
            {item.gap && (
              <p>
                <strong>待补：</strong>
                {item.gap}
              </p>
            )}
            {item.risk && (
              <p>
                <strong>风险：</strong>
                {item.risk}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function materialStatusBadge(item: ProjectMaterialItem) {
  if (item.files.length > 0 || item.status === 'uploaded') return 'badge-on';
  if (!item.required || item.status === 'not_required') return 'badge-off';
  return 'badge-warn';
}

function MaterialChecklistPanel({
  checklist,
  uploadingItemId,
  deletingFileId,
  onPickFile,
  onDeleteFile,
}: {
  checklist: ProjectMaterialChecklist;
  uploadingItemId: string;
  deletingFileId: string;
  onPickFile: (item: ProjectMaterialItem) => void;
  onDeleteFile: (itemId: string, fileId: string) => void;
}) {
  const requiredItems = checklist.items.filter((item) => item.required);
  const uploadedRequired = requiredItems.filter((item) => item.files.length > 0 || item.status === 'uploaded');
  const missingRequired = requiredItems.length - uploadedRequired.length;

  return (
    <div className="material-panel">
      <div className="analysis-summary">
        <strong>资料准备摘要</strong>
        <p>{checklist.summary}</p>
      </div>
      <div className="response-matrix-metrics">
        <div className="metric-card">
          <span>资料项</span>
          <strong>{checklist.items.length}</strong>
        </div>
        <div className="metric-card">
          <span>必需项</span>
          <strong>{requiredItems.length}</strong>
        </div>
        <div className="metric-card">
          <span>已补齐</span>
          <strong>{uploadedRequired.length}</strong>
        </div>
        <div className="metric-card">
          <span>待上传</span>
          <strong>{missingRequired}</strong>
        </div>
      </div>
      <div className="material-list">
        {checklist.items.map((item) => (
          <div className="material-item" key={item.id}>
            <div className="material-head">
              <span className={`badge ${materialStatusBadge(item)}`}>{MATERIAL_STATUS_LABELS[item.status]}</span>
              <span className="badge badge-off">{MATERIAL_CATEGORY_LABELS[item.category]}</span>
              <span className="badge badge-off">{MATERIAL_OWNER_LABELS[item.ownerRole]}</span>
              {item.required ? <span className="badge badge-warn">必需</span> : <span className="badge badge-off">可选</span>}
            </div>
            <div className="material-title-row">
              <strong>{item.title}</strong>
              <button className="mini-btn" onClick={() => onPickFile(item)} disabled={uploadingItemId === item.id}>
                <IconUploadCloud />
                {uploadingItemId === item.id ? '上传中…' : '上传材料'}
              </button>
            </div>
            <p>{item.description}</p>
            <p>
              <strong>用途：</strong>
              {item.purpose}
            </p>
            {item.suggestedSection && (
              <p>
                <strong>补充位置：</strong>
                {item.suggestedSection}
              </p>
            )}
            {item.sourceClause && <span className="muted">依据：{item.sourceClause}</span>}
            {item.uploadTips && <div className="material-tip">{item.uploadTips}</div>}
            <div className="material-file-list">
              {item.files.length === 0 ? (
                <span className="muted">尚未上传</span>
              ) : (
                item.files.map((file) => (
                  <span className="material-file-chip" key={file.id}>
                    <IconCheckCircle />
                    {file.fileName} · {file.fileType.toUpperCase()} · {file.charCount.toLocaleString()} 字
                    <button
                      className="link-btn"
                      onClick={() => onDeleteFile(item.id, file.id)}
                      disabled={deletingFileId === file.id}
                    >
                      删除
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WorkspacePage({
  onGoSettings,
  openProjectId,
}: {
  onGoSettings: () => void;
  openProjectId?: string;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [autoIntakeStage, setAutoIntakeStage] = useState<AutoIntakeStage>('idle');
  const [autoIntakeMessage, setAutoIntakeMessage] = useState('');
  const [uploadingOriginalPlan, setUploadingOriginalPlan] = useState(false);
  const [sectionDraftId, setSectionDraftId] = useState('');
  const [sectionAction, setSectionAction] = useState<'detect' | 'select' | 'reset' | ''>('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [originalPlanPreview, setOriginalPlanPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const originalPlanFileRef = useRef<HTMLInputElement>(null);
  const materialFileRef = useRef<HTMLInputElement>(null);
  const [materialTargetItemId, setMaterialTargetItemId] = useState('');

  // 招标文件关键项解析
  const [analysis, setAnalysis] = useState<TenderAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // 招标书行业/采购类型画像
  const [industryProfile, setIndustryProfile] = useState<TenderIndustryProfile | null>(null);
  const [industryLoading, setIndustryLoading] = useState(false);

  // 目录相关
  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlineVariants, setOutlineVariants] = useState<OutlineVariant[]>([]);
  const [selectedOutlineVariantId, setSelectedOutlineVariantId] = useState('');
  const [outlineDirty, setOutlineDirty] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [savingOutline, setSavingOutline] = useState(false);
  const [exporting, setExporting] = useState<'markdown' | 'docx' | 'pdf' | 'stamped' | ''>('');
  const [workbookExporting, setWorkbookExporting] = useState<WorkbookExportKind | ''>('');

  // 全局事实
  const [facts, setFacts] = useState<GlobalFacts | null>(null);
  const [factsDirty, setFactsDirty] = useState(false);
  const [factsLoading, setFactsLoading] = useState(false);
  const [savingFacts, setSavingFacts] = useState(false);

  // 点对点响应矩阵
  const [responseMatrix, setResponseMatrix] = useState<ResponseMatrix | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

  // 商务/技术偏离表
  const [deviationTable, setDeviationTable] = useState<DeviationTable | null>(null);
  const [deviationLoading, setDeviationLoading] = useState(false);

  // 客户资料补齐
  const [materialChecklist, setMaterialChecklist] = useState<ProjectMaterialChecklist | null>(null);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [uploadingMaterialItemId, setUploadingMaterialItemId] = useState('');
  const [deletingMaterialFileId, setDeletingMaterialFileId] = useState('');

  // 全文一致性审计
  const [audit, setAudit] = useState<ConsistencyAudit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // 提交前总检
  const [readiness, setReadiness] = useState<BidReadinessReport | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // 电子盖章
  const sealFileRef = useRef<HTMLInputElement>(null);
  const sealPageRef = useRef<HTMLDivElement>(null);
  const sealImageObjectUrlRef = useRef('');
  const [sealState, setSealState] = useState<SealState>({ seal: null, placements: [] });
  const [sealImageUrl, setSealImageUrl] = useState('');
  const [sealLoading, setSealLoading] = useState(false);
  const [sealUploading, setSealUploading] = useState(false);
  const [sealSaving, setSealSaving] = useState(false);
  const [sealPage, setSealPage] = useState(1);
  const [sealWidth, setSealWidth] = useState(0.18);
  const [activePlacementId, setActivePlacementId] = useState('');

  const current = projects.find((p) => p.id === currentId) ?? null;
  const currentSectionKey = current?.bidSections.map((section) => section.id).join('|') ?? '';

  async function refresh(selectId?: string) {
    const list = await api.listProjects();
    setProjects(list);
    if (selectId) setCurrentId(selectId);
    else if (!list.find((p) => p.id === currentId)) setCurrentId(list[0]?.id ?? '');
  }

  function mergeProject(project: Project) {
    setProjects((items) => {
      const exists = items.some((item) => item.id === project.id);
      const next = exists ? items.map((item) => (item.id === project.id ? project : item)) : [project, ...items];
      return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    setCurrentId(project.id);
  }

  function invalidateReadiness() {
    setReadiness(null);
  }

  function clearTenderDependentState(includeAnalysis: boolean) {
    if (includeAnalysis) {
      setAnalysis(null);
      setIndustryProfile(null);
    }
    setOutline(null);
    setOutlineVariants([]);
    setSelectedOutlineVariantId('');
    setOutlineDirty(false);
    setFacts(null);
    setFactsDirty(false);
    setResponseMatrix(null);
    setDeviationTable(null);
    setMaterialChecklist(null);
    setAudit(null);
    invalidateReadiness();
  }

  async function reloadTenderPreview(projectId: string) {
    try {
      const res = await api.getTenderText(projectId);
      setPreview(res.text.slice(0, 4000));
    } catch {
      setPreview('');
    }
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openProjectId || openProjectId === currentId) return;
    if (projects.some((project) => project.id === openProjectId)) {
      setCurrentId(openProjectId);
    }
  }, [currentId, openProjectId, projects]);

  useEffect(() => {
    setSectionDraftId(current?.selectedBidSectionId ?? current?.bidSections[0]?.id ?? '');
  }, [currentId, current?.selectedBidSectionId, currentSectionKey]);

  useEffect(() => {
    return () => {
      if (sealImageObjectUrlRef.current) {
        URL.revokeObjectURL(sealImageObjectUrlRef.current);
      }
    };
  }, []);

  function replaceSealImageUrl(url: string) {
    if (sealImageObjectUrlRef.current) {
      URL.revokeObjectURL(sealImageObjectUrlRef.current);
    }
    sealImageObjectUrlRef.current = url;
    setSealImageUrl(url);
  }

  // 切换项目时载入已有 Markdown 工作稿预览 + 已有目录
  useEffect(() => {
    setPreview('');
    setOriginalPlanPreview('');
    setAutoIntakeStage('idle');
    setAutoIntakeMessage('');
    setAnalysis(null);
    setIndustryProfile(null);
    setOutline(null);
    setOutlineVariants([]);
    setSelectedOutlineVariantId('');
    setOutlineDirty(false);
    setFacts(null);
    setFactsDirty(false);
    setResponseMatrix(null);
    setDeviationTable(null);
    setMaterialChecklist(null);
    setAudit(null);
    setReadiness(null);
    setSealState({ seal: null, placements: [] });
    replaceSealImageUrl('');
    setSealPage(1);
    setSealWidth(0.18);
    setActivePlacementId('');
    if (current?.tender) {
      api
        .getTenderText(current.id)
        .then((r) => setPreview(r.text.slice(0, 4000)))
        .catch(() => setPreview(''));
      api
        .getAnalysis(current.id)
        .then((a) => setAnalysis(a))
        .catch(() => setAnalysis(null));
      api
        .getIndustryProfile(current.id)
        .then((profile) => setIndustryProfile(profile))
        .catch(() => setIndustryProfile(null));
    }
    if (current?.originalPlan) {
      api
        .getOriginalPlanText(current.id)
        .then((r) => setOriginalPlanPreview(r.text.slice(0, 3000)))
        .catch(() => setOriginalPlanPreview(''));
    }
    if (current) {
      api
        .getOutline(current.id)
        .then((o) => setOutline(o))
        .catch(() => setOutline(null));
      api
        .getGlobalFacts(current.id)
        .then((f) => setFacts(f))
        .catch(() => setFacts(null));
      api
        .getResponseMatrix(current.id)
        .then((m) => {
          setResponseMatrix(m);
          return api.getDeviationTable(current.id);
        })
        .then((table) => setDeviationTable(table))
        .catch(() => {
          setResponseMatrix(null);
          setDeviationTable(null);
        });
      api
        .getMaterialChecklist(current.id)
        .then((m) => setMaterialChecklist(m))
        .catch(() => setMaterialChecklist(null));
      api
        .getConsistencyAudit(current.id)
        .then((a) => setAudit(a))
        .catch(() => setAudit(null));
      api
        .getBidReadiness(current.id)
        .then((report) => setReadiness(report))
        .catch(() => setReadiness(null));
      setSealLoading(true);
      api
        .getSealState(current.id)
        .then(async (state) => {
          setSealState(state);
          if (state.placements[0]) {
            setSealPage(state.placements[0].page);
            setSealWidth(state.placements[0].widthRatio);
            setActivePlacementId(state.placements[0].id);
          }
          if (state.seal) {
            const blob = await api.fetchSealImage(current.id);
            replaceSealImageUrl(URL.createObjectURL(blob));
          }
        })
        .catch(() => {
          setSealState({ seal: null, placements: [] });
          replaceSealImageUrl('');
        })
        .finally(() => setSealLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  async function handleGenerateAnalysis() {
    if (!current) return;
    setAnalysisLoading(true);
    setError('');
    try {
      const a = await api.generateAnalysis(current.id);
      setAnalysis(a);
      setIndustryProfile(null);
      setResponseMatrix(null);
      setDeviationTable(null);
      setMaterialChecklist(null);
      setAudit(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function handleGenerateIndustryProfile() {
    if (!current) return;
    setIndustryLoading(true);
    setError('');
    try {
      const profile = await api.generateIndustryProfile(current.id);
      setIndustryProfile(profile);
      setResponseMatrix(null);
      setDeviationTable(null);
      setMaterialChecklist(null);
      setAudit(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIndustryLoading(false);
    }
  }

  async function handleGenerateOutline() {
    if (!current) return;
    setGenLoading(true);
    setError('');
    try {
      const result = await api.generateOutlineVariants(current.id);
      setOutlineVariants(result.variants);
      const first = result.variants[0];
      if (first) {
        setSelectedOutlineVariantId(first.id);
        setOutline(first.outline);
        setOutlineDirty(true);
      }
      setFacts(null);
      setFactsDirty(false);
      setResponseMatrix(null);
      setDeviationTable(null);
      setMaterialChecklist(null);
      setAudit(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenLoading(false);
    }
  }

  function handleSelectOutlineVariant(variant: OutlineVariant) {
    setSelectedOutlineVariantId(variant.id);
    setOutline(variant.outline);
    setOutlineDirty(true);
    setFacts(null);
    setFactsDirty(false);
    setResponseMatrix(null);
    setDeviationTable(null);
    setMaterialChecklist(null);
    setAudit(null);
    invalidateReadiness();
  }

  async function handleSaveOutline(clearResponseMatrix = true) {
    if (!current || !outline) return;
    setSavingOutline(true);
    try {
      const o = await api.saveOutline(current.id, outline, { clearResponseMatrix });
      setOutline(o);
      setOutlineDirty(false);
      if (clearResponseMatrix) {
        setResponseMatrix(null);
        setDeviationTable(null);
        setMaterialChecklist(null);
      }
      setAudit(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingOutline(false);
    }
  }

  async function handleGenerateFacts() {
    if (!current) return;
    setFactsLoading(true);
    setError('');
    try {
      const f = await api.generateGlobalFacts(current.id);
      setFacts(f);
      setFactsDirty(false);
      setResponseMatrix(null);
      setDeviationTable(null);
      setMaterialChecklist(null);
      setAudit(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFactsLoading(false);
    }
  }

  async function handleSaveFacts() {
    if (!current || !facts) return;
    setSavingFacts(true);
    setError('');
    try {
      const f = await api.saveGlobalFacts(current.id, facts);
      setFacts(f);
      setFactsDirty(false);
      setResponseMatrix(null);
      setDeviationTable(null);
      setMaterialChecklist(null);
      setAudit(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingFacts(false);
    }
  }

  async function handleRunAudit() {
    if (!current) return;
    setAuditLoading(true);
    setError('');
    try {
      if (outline && outlineDirty) {
        await api.saveOutline(current.id, outline, { clearResponseMatrix: false });
        setOutlineDirty(false);
      }
      if (facts && factsDirty) {
        await api.saveGlobalFacts(current.id, facts);
        setFactsDirty(false);
      }
      const result = await api.runConsistencyAudit(current.id);
      setAudit(result);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuditLoading(false);
    }
  }

  async function handleRunReadiness() {
    if (!current) return;
    setReadinessLoading(true);
    setError('');
    try {
      if (outline && outlineDirty) {
        const saved = await api.saveOutline(current.id, outline, { clearResponseMatrix: false });
        setOutline(saved);
        setOutlineDirty(false);
      }
      if (facts && factsDirty) {
        const savedFacts = await api.saveGlobalFacts(current.id, facts);
        setFacts(savedFacts);
        setFactsDirty(false);
      }
      const report = await api.runBidReadiness(current.id);
      setReadiness(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReadinessLoading(false);
    }
  }

  async function handleGenerateResponseMatrix() {
    if (!current) return;
    setMatrixLoading(true);
    setError('');
    try {
      if (outline && outlineDirty) {
        const saved = await api.saveOutline(current.id, outline, { clearResponseMatrix: false });
        setOutline(saved);
        setOutlineDirty(false);
      }
      if (facts && factsDirty) {
        const savedFacts = await api.saveGlobalFacts(current.id, facts);
        setFacts(savedFacts);
        setFactsDirty(false);
      }
      const matrix = await api.generateResponseMatrix(current.id);
      setResponseMatrix(matrix);
      setDeviationTable(null);
      setMaterialChecklist(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMatrixLoading(false);
    }
  }

  async function handleGenerateDeviationTable() {
    if (!current) return;
    setDeviationLoading(true);
    setError('');
    try {
      const table = await api.generateDeviationTable(current.id);
      setDeviationTable(table);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeviationLoading(false);
    }
  }

  async function handleGenerateMaterialChecklist() {
    if (!current) return;
    setMaterialLoading(true);
    setError('');
    try {
      if (outline && outlineDirty) {
        const saved = await api.saveOutline(current.id, outline, { clearResponseMatrix: false });
        setOutline(saved);
        setOutlineDirty(false);
      }
      if (facts && factsDirty) {
        const savedFacts = await api.saveGlobalFacts(current.id, facts);
        setFacts(savedFacts);
        setFactsDirty(false);
      }
      const checklist = await api.generateMaterialChecklist(current.id);
      setMaterialChecklist(checklist);
      setAudit(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMaterialLoading(false);
    }
  }

  function handlePickMaterialFile(item: ProjectMaterialItem) {
    setMaterialTargetItemId(item.id);
    materialFileRef.current?.click();
  }

  async function handleMaterialFile(file: File) {
    if (!current || !materialTargetItemId) return;
    setUploadingMaterialItemId(materialTargetItemId);
    setError('');
    try {
      const checklist = await api.uploadMaterialFile(current.id, materialTargetItemId, file);
      setMaterialChecklist(checklist);
      setAudit(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingMaterialItemId('');
      setMaterialTargetItemId('');
      if (materialFileRef.current) materialFileRef.current.value = '';
    }
  }

  async function handleDeleteMaterialFile(itemId: string, fileId: string) {
    if (!current) return;
    setDeletingMaterialFileId(fileId);
    setError('');
    try {
      const checklist = await api.deleteMaterialFile(current.id, itemId, fileId);
      setMaterialChecklist(checklist);
      setAudit(null);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingMaterialFileId('');
    }
  }

  async function persistOutlineBeforeExport() {
    if (!current || !outline || !outlineDirty) return;
    const saved = await api.saveOutline(current.id, outline, { clearResponseMatrix: false });
    setOutline(saved);
    setOutlineDirty(false);
    invalidateReadiness();
  }

  async function handleWorkbookExport(
    kind: WorkbookExportKind,
    runner: (id: string, fallbackName: string) => Promise<void>,
  ) {
    if (!current) return;
    setWorkbookExporting(kind);
    setError('');
    try {
      await runner(current.id, current.name || '投标技术方案');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorkbookExporting('');
    }
  }

  async function handleExportDocx() {
    if (!current) return;
    setExporting('docx');
    setError('');
    try {
      await persistOutlineBeforeExport();
      await api.downloadDocx(current.id, current.name || '投标技术方案');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting('');
    }
  }

  async function handleExportMarkdown() {
    if (!current) return;
    setExporting('markdown');
    setError('');
    try {
      await persistOutlineBeforeExport();
      await api.downloadMarkdown(current.id, current.name || '投标技术方案');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting('');
    }
  }

  async function handleExportPdf() {
    if (!current) return;
    setExporting('pdf');
    setError('');
    try {
      await persistOutlineBeforeExport();
      await api.downloadPdf(current.id, current.name || '投标技术方案');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting('');
    }
  }

  async function handleExportStampedPdf() {
    if (!current) return;
    setExporting('stamped');
    setError('');
    try {
      await persistOutlineBeforeExport();
      await api.saveSealPlacements(current.id, sealState.placements);
      await api.downloadStampedPdf(current.id, current.name || '投标技术方案');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting('');
    }
  }

  async function handleCreate() {
    const name = window.prompt('项目名称', '未命名标书');
    if (name === null) return;
    const p = await api.createProject(name || '未命名标书');
    await refresh(p.id);
  }

  async function handleRename() {
    if (!current) return;
    const name = window.prompt('项目名称', current.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === current.name) return;
    try {
      const p = await api.renameProject(current.id, trimmed);
      await refresh(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete() {
    if (!current) return;
    if (!window.confirm(`确定删除项目「${current.name}」？该操作不可恢复。`)) return;
    await api.deleteProject(current.id);
    await refresh();
  }

  async function handleFile(file: File) {
    if (!current) {
      setError('请先创建或选择一个项目');
      return;
    }
    setUploading(true);
    setError('');
    setAutoIntakeStage('uploading');
    setAutoIntakeMessage('正在上传并解析招标文件，完成后会自动提取需求明细。');
    let uploaded = false;
    try {
      const res = await api.uploadTender(current.id, file);
      uploaded = true;
      mergeProject(res.project);
      setPreview(res.preview);
      clearTenderDependentState(true);

      setAutoIntakeStage('analysis');
      setAutoIntakeMessage('已完成文件解析，正在提取项目概况、评分要求和废标风险。');
      const nextAnalysis = await api.generateAnalysis(res.project.id);
      setAnalysis(nextAnalysis);

      setAutoIntakeStage('industry');
      setAutoIntakeMessage('需求明细已生成，正在判断行业、采购类型和响应重点。');
      const nextProfile = await api.generateIndustryProfile(res.project.id);
      setIndustryProfile(nextProfile);

      setAutoIntakeStage('done');
      setAutoIntakeMessage('自动解析完成。可以查看招标需求明细，或继续生成目录。');
    } catch (e) {
      setAutoIntakeStage('error');
      setAutoIntakeMessage(
        uploaded
          ? '文件已保留；自动解析未完成。请检查 AI 配置或在下方手动重试。'
          : '上传或文件解析失败，请确认文件格式和大小后重试。',
      );
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleOriginalPlanFile(file: File) {
    if (!current) {
      setError('请先创建或选择一个项目');
      return;
    }
    setUploadingOriginalPlan(true);
    setError('');
    try {
      const res = await api.uploadOriginalPlan(current.id, file);
      setOriginalPlanPreview(res.preview);
      clearTenderDependentState(false);
      await refresh(current.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingOriginalPlan(false);
      if (originalPlanFileRef.current) originalPlanFileRef.current.value = '';
    }
  }

  async function handleDeleteOriginalPlan() {
    if (!current) return;
    if (!window.confirm('确定移除已有技术方案？目录、事实、正文等下游生成结果会失效。')) return;
    try {
      await api.deleteOriginalPlan(current.id);
      setOriginalPlanPreview('');
      clearTenderDependentState(false);
      await refresh(current.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDetectBidSections() {
    if (!current?.tender) return;
    setSectionAction('detect');
    setError('');
    try {
      const project = await api.detectBidSections(current.id);
      mergeProject(project);
      setSectionDraftId(project.selectedBidSectionId ?? project.bidSections[0]?.id ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSectionAction('');
    }
  }

  async function handleSelectBidSection() {
    if (!current || !sectionDraftId) return;
    setSectionAction('select');
    setError('');
    try {
      const project = await api.selectBidSection(current.id, sectionDraftId);
      mergeProject(project);
      clearTenderDependentState(true);
      await reloadTenderPreview(project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSectionAction('');
    }
  }

  async function handleResetBidSection() {
    if (!current) return;
    setSectionAction('reset');
    setError('');
    try {
      const project = await api.resetBidSection(current.id);
      mergeProject(project);
      setSectionDraftId(project.bidSections[0]?.id ?? '');
      clearTenderDependentState(true);
      await reloadTenderPreview(project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSectionAction('');
    }
  }

  async function handleDownloadTenderMarkdown() {
    if (!current?.tender) return;
    setError('');
    try {
      await api.downloadTenderMarkdown(current.id, current.name || '投标技术方案');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDownloadOriginalPlanMarkdown() {
    if (!current?.originalPlan) return;
    setError('');
    try {
      await api.downloadOriginalPlanMarkdown(current.id, current.name || '投标技术方案');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSealFile(file: File) {
    if (!current) {
      setError('请先创建或选择一个项目');
      return;
    }
    setSealUploading(true);
    setError('');
    try {
      const state = await api.uploadSeal(current.id, file);
      setSealState(state);
      replaceSealImageUrl(URL.createObjectURL(file));
      invalidateReadiness();
      await refresh(current.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSealUploading(false);
      if (sealFileRef.current) sealFileRef.current.value = '';
    }
  }

  async function handleSaveSealPlacements() {
    if (!current) return;
    setSealSaving(true);
    setError('');
    try {
      const state = await api.saveSealPlacements(current.id, sealState.placements);
      setSealState(state);
      invalidateReadiness();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSealSaving(false);
    }
  }

  async function handleDeleteSeal() {
    if (!current) return;
    if (!window.confirm('确定删除当前项目的电子印章和已放置位置？')) return;
    setSealSaving(true);
    setError('');
    try {
      const state = await api.deleteSeal(current.id);
      setSealState(state);
      replaceSealImageUrl('');
      setActivePlacementId('');
      invalidateReadiness();
      await refresh(current.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSealSaving(false);
    }
  }

  function updatePlacement(id: string, patch: Partial<SealPlacement>) {
    invalidateReadiness();
    setSealState((state) => ({
      ...state,
      placements: state.placements.map((placement) =>
        placement.id === id ? { ...placement, ...patch } : placement,
      ),
    }));
  }

  function handleAddSealAt(clientX: number, clientY: number) {
    const page = sealPageRef.current;
    if (!page || !sealState.seal) return;
    const rect = page.getBoundingClientRect();
    const widthRatio = sealWidth;
    const xRatio = clamp((clientX - rect.left) / rect.width - widthRatio / 2, 0, 1 - widthRatio);
    const yRatio = clamp((clientY - rect.top) / rect.height - widthRatio / 2, 0, 1 - widthRatio);
    const placement: SealPlacement = {
      id: newPlacementId(),
      page: sealPage,
      xRatio,
      yRatio,
      widthRatio,
      opacity: 1,
      rotation: 0,
    };
    setSealState((state) => ({ ...state, placements: [...state.placements, placement] }));
    setActivePlacementId(placement.id);
    invalidateReadiness();
  }

  function handlePlacementPointerDown(e: ReactPointerEvent<HTMLButtonElement>, placement: SealPlacement) {
    e.stopPropagation();
    setActivePlacementId(placement.id);
    setSealWidth(placement.widthRatio);
    const page = sealPageRef.current;
    if (!page) return;
    const rect = page.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const originalX = placement.xRatio;
    const originalY = placement.yRatio;

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / rect.width;
      const dy = (moveEvent.clientY - startY) / rect.height;
      updatePlacement(placement.id, {
        xRatio: clamp(originalX + dx, 0, 1 - placement.widthRatio),
        yRatio: clamp(originalY + dy, 0, 1 - placement.widthRatio),
      });
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  function handleSealWidthChange(value: number) {
    const next = clamp(value, 0.08, 0.36);
    setSealWidth(next);
    if (activePlacementId) {
      updatePlacement(activePlacementId, { widthRatio: next });
    }
  }

  function handleRemoveActivePlacement() {
    if (!activePlacementId) return;
    setSealState((state) => ({
      ...state,
      placements: state.placements.filter((placement) => placement.id !== activePlacementId),
    }));
    setActivePlacementId('');
    invalidateReadiness();
  }

  if (loading) {
    return (
      <div className="page-header">
        <h1>标书工作台</h1>
        <p>加载中…</p>
      </div>
    );
  }

  const gen = outline ? countGenerated(outline) : { total: 0, done: 0 };
  const done1 = !!current?.tender;
  const done2 = !!analysis;
  const done3 = !!industryProfile;
  const done4 = !!outline;
  const done5 = !!facts && facts.items.length > 0;
  const done6 = !!responseMatrix && responseMatrix.items.length > 0;
  const requiredMaterials = materialChecklist?.items.filter((item) => item.required) ?? [];
  const uploadedRequiredMaterials = requiredMaterials.filter((item) => item.files.length > 0 || item.status === 'uploaded');
  const hasMaterialChecklist = !!materialChecklist && materialChecklist.items.length > 0;
  const done7 = hasMaterialChecklist && uploadedRequiredMaterials.length >= requiredMaterials.length;
  const done8 = gen.total > 0 && gen.done >= gen.total;
  const done9 = !!readiness && readiness.level !== 'blocked';
  const currentStep = !done1
    ? 1
    : !done2
      ? 2
      : !done3
        ? 3
        : !done4
          ? 4
          : !done5
            ? 5
            : !done6
              ? 6
              : !hasMaterialChecklist
                ? 7
                : !done8
                  ? 8
                  : !done9
                    ? 9
                    : 10;
  const flowSteps = [
    { no: '01', name: '上传招标文件', done: done1 },
    { no: '02', name: '解析关键项', done: done2 },
    { no: '03', name: '行业识别', done: done3 },
    { no: '04', name: 'AI 生成目录', done: done4 },
    { no: '05', name: '全局事实', done: done5 },
    { no: '06', name: '响应矩阵', done: done6 },
    { no: '07', name: '补充资料', done: done7 },
    { no: '08', name: 'AI 生成正文', done: done8 },
    { no: '09', name: '提交前总检', done: done9 },
    { no: '10', name: '导出/盖章', done: false },
  ];
  const activePlacement = sealState.placements.find((placement) => placement.id === activePlacementId) ?? null;
  const visibleSealPlacements = sealState.placements.filter((placement) => placement.page === sealPage);
  const sealSizeValue = activePlacement?.widthRatio ?? sealWidth;
  const selectedBidSection = current?.selectedBidSectionId
    ? current.bidSections.find((section) => section.id === current.selectedBidSectionId) ?? null
    : null;
  const hasBidSections = (current?.bidSections.length ?? 0) >= 2;
  const canApplySection = Boolean(sectionDraftId && sectionDraftId !== current?.selectedBidSectionId);
  const showAutoIntake = autoIntakeStage !== 'idle';
  const autoIntakeIndex = AUTO_INTAKE_STAGE_INDEX[autoIntakeStage];
  const autoIntakeBadge =
    autoIntakeStage === 'done' ? 'badge-on' : autoIntakeStage === 'error' ? 'badge-warn' : 'badge-off';

  return (
    <div>
      <div className="page-header">
        <h1>标书工作台</h1>
        <p>从招标文件到成稿，按“解析、行业识别、矩阵、资料、正文、总检、导出”的链路完成投标技术方案初稿。</p>
      </div>

      {/* 主链路总览 */}
      <div className="flow-bar">
        {flowSteps.map((s, i) => (
          <div key={s.no} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span
              className="flow-chip"
              data-current={currentStep === i + 1}
              data-done={s.done}
            >
              <span className="flow-no">{s.no}</span>
              <span>{s.name}</span>
            </span>
            {i < flowSteps.length - 1 && (
              <span className="flow-sep">
                <IconChevronRight />
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 项目选择栏 */}
      <div className="project-bar">
        <span className="project-bar-label">当前项目</span>
        <select value={currentId} onChange={(e) => setCurrentId(e.target.value)}>
          {projects.length === 0 && <option value="">（暂无项目）</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.tender ? ` · ${p.tender.fileName}` : ' · 未上传'}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={handleCreate}>
          <IconPlus />
          新建
        </button>
        {current && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={handleRename}>
              <IconPen />
              重命名
            </button>
            <button className="btn btn-ghost btn-sm danger" onClick={handleDelete}>
              <IconTrash />
              删除
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="result err">
          <IconAlertTriangle />
          <span>{error}</span>
        </div>
      )}

      <input
        ref={materialFileRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleMaterialFile(f);
        }}
      />

      {/* Step 1 上传招标文件 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className="step-no">01</div>
          <div>
            <h2>上传招标文件</h2>
            <p className="hint" style={{ margin: 0 }}>
              支持 PDF、Word(.docx)、txt / md。上传后自动解读标书，提取需求明细、评分点和行业判断。
            </p>
          </div>
        </div>

        {!current ? (
          <div className="empty-tip">
            请先 <button className="link-btn" onClick={handleCreate}>新建一个项目</button>。
          </div>
        ) : (
          <>
            <div
              className="dropzone"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <IconUploadCloud />
              {uploading ? (
                <span>{autoIntakeStage === 'uploading' ? '上传解析中…' : '自动解读中…'}</span>
              ) : (
                <span>点击选择，或将文件拖拽到此处</span>
              )}
              <span className="dz-sub">支持 PDF / Word(.docx) / txt / md</span>
            </div>

            {showAutoIntake && (
              <div className={`auto-intake-card ${autoIntakeStage === 'error' ? 'is-error' : ''}`}>
                <div className="auto-intake-head">
                  <span className={`badge ${autoIntakeBadge}`}>{AUTO_INTAKE_STAGE_LABELS[autoIntakeStage]}</span>
                  <span>{autoIntakeMessage}</span>
                </div>
                <div className="auto-intake-steps">
                  {AUTO_INTAKE_STEPS.map((step, index) => {
                    const state =
                      autoIntakeStage === 'error'
                        ? index < autoIntakeIndex
                          ? 'done'
                          : index === Math.max(autoIntakeIndex, 0)
                            ? 'error'
                            : 'pending'
                        : index < autoIntakeIndex || autoIntakeStage === 'done'
                          ? 'done'
                          : index === autoIntakeIndex
                            ? 'current'
                            : 'pending';
                    return (
                      <span className="auto-intake-step" data-state={state} key={step.stage}>
                        <span>{index + 1}</span>
                        {step.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {current.tender && (
              <div className="tender-meta">
                <span className="badge badge-on">
                  <IconCheckCircle />
                  已解析
                </span>
                <span>{current.tender.fileName}</span>
                <span className="muted">·</span>
                <span className="muted">{current.tender.fileType.toUpperCase()}</span>
                <span className="muted">·</span>
                <span className="muted">{current.tender.charCount.toLocaleString()} 字</span>
                <button type="button" className="mini-btn" onClick={handleDownloadTenderMarkdown}>
                  <IconDownload />
                  Markdown
                </button>
              </div>
            )}

            {current.tender && (
              <div className="bid-section-box">
                <div className="bid-section-head">
                  <div>
                    <h3>投标范围</h3>
                    <p className="hint">
                      {hasBidSections
                        ? `已识别 ${current.bidSections.length} 个标段/分包，可指定后续生成范围。`
                        : '当前按完整招标文件生成。'}
                    </p>
                  </div>
                  <div className="actions">
                    {selectedBidSection && (
                      <span className="badge badge-on">
                        <IconCheckCircle />
                        {selectedBidSection.title}
                      </span>
                    )}
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={handleDetectBidSections}
                      disabled={sectionAction === 'detect'}
                    >
                      <IconSettings />
                      {sectionAction === 'detect' ? '识别中…' : '重新识别'}
                    </button>
                  </div>
                </div>

                {hasBidSections ? (
                  <>
                    <div className="bid-section-controls">
                      <select value={sectionDraftId} onChange={(e) => setSectionDraftId(e.target.value)}>
                        {current.bidSections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleSelectBidSection}
                        disabled={!canApplySection || sectionAction === 'select'}
                      >
                        <IconCheckCircle />
                        {sectionAction === 'select' ? '应用中…' : '应用标段'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleResetBidSection}
                        disabled={!current.selectedBidSectionId || sectionAction === 'reset'}
                      >
                        <IconEye />
                        {sectionAction === 'reset' ? '恢复中…' : '使用全文'}
                      </button>
                    </div>
                    <div className="bid-section-list">
                      {current.bidSections.map((section) => (
                        <button
                          key={section.id}
                          type="button"
                          className={`bid-section-item ${sectionDraftId === section.id ? 'active' : ''}`}
                          onClick={() => setSectionDraftId(section.id)}
                        >
                          <strong>{section.title}</strong>
                          <span>
                            原文第 {section.startLine}-{section.endLine} 行
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty-tip">未识别到多个明确标段/分包，后续将按全文处理。</div>
                )}
              </div>
            )}

            <div className="original-plan-box">
              <div className="original-plan-head">
                <div>
                  <h3>已有技术方案扩写</h3>
                  <p className="hint">
                    可选上传一份已写好的方案。上传后，后续目录与正文会以原方案为基础做优化和扩写。
                  </p>
                </div>
                {current.originalPlan && (
                  <button className="mini-btn danger" onClick={handleDeleteOriginalPlan}>
                    <IconTrash />
                    移除
                  </button>
                )}
              </div>

              <div
                className="compact-dropzone"
                onClick={() => originalPlanFileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleOriginalPlanFile(f);
                }}
              >
                <input
                  ref={originalPlanFileRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleOriginalPlanFile(f);
                  }}
                />
                <IconUploadCloud />
                <span>{uploadingOriginalPlan ? '解析中…' : current.originalPlan ? '重新上传已有方案' : '上传已有方案（可选）'}</span>
                {current.originalPlan && (
                  <strong>
                    {current.originalPlan.fileName} · {current.originalPlan.charCount.toLocaleString()} 字
                  </strong>
                )}
              </div>
              {current.originalPlan && (
                <div className="actions" style={{ marginTop: 12 }}>
                  <button type="button" className="mini-btn" onClick={handleDownloadOriginalPlanMarkdown}>
                    <IconDownload />
                    下载已有方案 Markdown
                  </button>
                </div>
              )}
            </div>

            {preview && (
              <div className="preview-box">
                <div className="preview-title">
                  <IconEye />
                  招标文件 Markdown 预览（前 4000 字）
                </div>
                <pre>{preview}</pre>
              </div>
            )}

            {originalPlanPreview && (
              <div className="preview-box">
                <div className="preview-title">
                  <IconEye />
                  已有方案 Markdown 预览（前 3000 字）
                </div>
                <pre>{originalPlanPreview}</pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 2 招标文件关键项解析 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${current?.tender ? '' : 'muted-no'}`}>02</div>
          <div>
            <h2>解析关键项</h2>
            <p className="hint" style={{ margin: 0 }}>
              提取项目、甲方、交付服务、评分要求和无效/废标条款，供目录、正文和检查模块复用。
            </p>
          </div>
        </div>

        {!current?.tender ? (
          <div className="empty-tip">请先在上一步上传并解析招标文件。</div>
        ) : (
          <>
            <div className="actions" style={{ marginBottom: analysis ? 16 : 0 }}>
              <button
                className="btn btn-primary"
                onClick={handleGenerateAnalysis}
                disabled={analysisLoading}
              >
                <IconPen />
                {analysisLoading ? '解析中…' : analysis ? '重新解析关键项' : 'AI 解析关键项'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onGoSettings}>
                <IconSettings />
                AI 配置
              </button>
              {analysis && (
                <span className="muted" style={{ fontSize: 12 }}>
                  关键要求 {analysis.keyRequirements.length} 条 · 风险条款 {analysis.rejectionRequirements.length} 条
                </span>
              )}
            </div>

            {analysis && (
              <div className="analysis-panel">
                {analysis.summary && (
                  <div className="analysis-summary">
                    <strong>项目摘要</strong>
                    <p>{analysis.summary}</p>
                  </div>
                )}
                <InfoGrid title="项目信息" data={analysis.projectInfo} />
                <InfoGrid title="甲方信息" data={analysis.buyerInfo} />
                <InfoGrid title="交付与服务要求" data={analysis.deliveryAndServiceRequirements} />
                <RequirementList title="关键技术/商务/评分要求" items={analysis.keyRequirements} />
                <RequirementList title="无效投标与废标风险" items={analysis.rejectionRequirements} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 3 招标书行业/采购类型识别 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${analysis ? '' : 'muted-no'}`}>03</div>
          <div>
            <h2>行业识别</h2>
            <p className="hint" style={{ margin: 0 }}>
              自动判断招标书行业、采购对象、资料重点、响应重点和常见风险，用于后续矩阵、资料清单和正文生成。
            </p>
          </div>
        </div>

        {!analysis ? (
          <div className="empty-tip">请先在上一步解析招标文件关键项。</div>
        ) : (
          <>
            <div className="actions" style={{ marginBottom: industryProfile ? 16 : 0 }}>
              <button
                className="btn btn-primary"
                onClick={handleGenerateIndustryProfile}
                disabled={industryLoading}
              >
                <IconCheckCircle />
                {industryLoading ? '识别中…' : industryProfile ? '重新识别行业' : 'AI 识别行业'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onGoSettings}>
                <IconSettings />
                AI 配置
              </button>
              {industryProfile && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {INDUSTRY_LABELS[industryProfile.industry]} · {PROCUREMENT_TYPE_LABELS[industryProfile.procurementType]} ·{' '}
                  {CONFIDENCE_LABELS[industryProfile.confidence]}
                </span>
              )}
            </div>

            {industryProfile && <IndustryProfilePanel profile={industryProfile} />}
          </>
        )}
      </div>

      {/* Step 4 AI 生成目录 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${industryProfile ? '' : 'muted-no'}`}>04</div>
          <div>
            <h2>AI 生成目录</h2>
            <p className="hint" style={{ margin: 0 }}>
              根据招标文件和行业画像生成 3 套目录方案，选择后可调整章节和预计字数。
            </p>
          </div>
        </div>

        {!industryProfile ? (
          <div className="empty-tip">请先识别招标书行业和采购类型。</div>
        ) : (
          <>
            <div className="actions" style={{ marginBottom: outline ? 16 : 0 }}>
              <button
                className="btn btn-primary"
                onClick={handleGenerateOutline}
                disabled={genLoading}
              >
                <IconPen />
                {genLoading ? 'AI 生成中…' : outlineVariants.length > 0 ? '重新生成 3 套方案' : 'AI 生成 3 套目录'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onGoSettings}>
                <IconSettings />
                AI 配置
              </button>
              {outline && (
                <span className="muted" style={{ fontSize: 12 }}>
                  共 {outline.nodes.length} 个一级章节 · 预计 {collectOutlineLeafStats(outline.nodes).estimatedWords.toLocaleString()} 字
                </span>
              )}
            </div>

            {outlineVariants.length > 0 && (
              <OutlineVariantsPanel
                variants={outlineVariants}
                selectedId={selectedOutlineVariantId}
                onSelect={handleSelectOutlineVariant}
              />
            )}

            {outline && (
              <>
                <OutlineEditor
                  outline={outline}
                  onChange={(o) => {
                    setOutline(o);
                    setOutlineDirty(true);
                    setResponseMatrix(null);
                    setDeviationTable(null);
                    setMaterialChecklist(null);
                    setAudit(null);
                    invalidateReadiness();
                  }}
                />
                <div className="actions" style={{ marginTop: 16 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSaveOutline(true)}
                    disabled={savingOutline || !outlineDirty}
                  >
                    {savingOutline ? '保存中…' : outlineDirty ? '保存目录' : '已保存'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Step 5 全局事实 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${outline ? '' : 'muted-no'}`}>05</div>
          <div>
            <h2>全局事实</h2>
            <p className="hint" style={{ margin: 0 }}>
              抽取正文里必须保持一致的项目事实，例如工期、地点、交付范围、质保、响应时限和评分承诺。
            </p>
          </div>
        </div>

        {!outline ? (
          <div className="empty-tip">请先生成目录。</div>
        ) : (
          <>
            <div className="actions" style={{ marginBottom: facts ? 16 : 0 }}>
              <button
                className="btn btn-primary"
                onClick={handleGenerateFacts}
                disabled={factsLoading}
              >
                <IconPen />
                {factsLoading ? '生成中…' : facts ? '重新生成事实' : 'AI 生成全局事实'}
              </button>
              {facts && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleSaveFacts}
                  disabled={savingFacts || !factsDirty}
                >
                  <IconSave />
                  {savingFacts ? '保存中…' : factsDirty ? '保存事实' : '已保存'}
                </button>
              )}
              {facts && (
                <span className="muted" style={{ fontSize: 12 }}>
                  共 {facts.items.length} 条事实变量
                </span>
              )}
            </div>

            {facts && (
              <FactsEditor
                facts={facts}
                onChange={(next) => {
                  setFacts(next);
                  setFactsDirty(true);
                  setResponseMatrix(null);
                  setDeviationTable(null);
                  setMaterialChecklist(null);
                  setAudit(null);
                  invalidateReadiness();
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Step 6 点对点响应矩阵 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${facts ? '' : 'muted-no'}`}>06</div>
          <div>
            <h2>点对点响应矩阵</h2>
            <p className="hint" style={{ margin: 0 }}>
              把评分点、废标项、商务材料、技术条款和服务承诺拆成团队任务，并检查正文是否逐项覆盖。
            </p>
          </div>
        </div>

        {!industryProfile ? (
          <div className="empty-tip">请先识别招标书行业和采购类型。</div>
        ) : !facts ? (
          <div className="empty-tip">请先生成并确认全局事实。</div>
        ) : (
          <>
            <div className="actions" style={{ marginBottom: responseMatrix ? 16 : 0 }}>
              <button
                className="btn btn-primary"
                onClick={handleGenerateResponseMatrix}
                disabled={matrixLoading}
              >
                <IconCheckCircle />
                {matrixLoading ? '分析中…' : responseMatrix ? '刷新响应矩阵' : '生成响应矩阵'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onGoSettings}>
                <IconSettings />
                AI 配置
              </button>
              {responseMatrix && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleWorkbookExport('response-md', api.downloadResponseMatrixMarkdown)}
                    disabled={!!workbookExporting}
                  >
                    <IconDownload />
                    {workbookExporting === 'response-md' ? '导出中…' : '矩阵 MD'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleWorkbookExport('response-csv', api.downloadResponseMatrixCsv)}
                    disabled={!!workbookExporting}
                  >
                    <IconDownload />
                    {workbookExporting === 'response-csv' ? '导出中…' : '矩阵 CSV'}
                  </button>
                  <span className="muted" style={{ fontSize: 12 }}>
                    共 {responseMatrix.items.length} 项 ·{' '}
                    {responseMatrix.items.filter((item) => ['missing', 'partial', 'risk'].includes(item.status)).length} 项需补齐
                  </span>
                </>
              )}
            </div>

            {responseMatrix && (
              <>
                <ResponseMatrixPanel matrix={responseMatrix} />
                <div className="deviation-box">
                  <div className="actions" style={{ marginBottom: deviationTable ? 16 : 0 }}>
                    <button
                      className="btn btn-ghost"
                      onClick={handleGenerateDeviationTable}
                      disabled={deviationLoading}
                    >
                      <IconCheckCircle />
                      {deviationLoading ? '生成中…' : deviationTable ? '刷新偏离表' : '生成偏离表'}
                    </button>
                    {deviationTable && (
                      <>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleWorkbookExport('deviation-md', api.downloadDeviationTableMarkdown)}
                          disabled={!!workbookExporting}
                        >
                          <IconDownload />
                          {workbookExporting === 'deviation-md' ? '导出中…' : '偏离表 MD'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleWorkbookExport('deviation-csv', api.downloadDeviationTableCsv)}
                          disabled={!!workbookExporting}
                        >
                          <IconDownload />
                          {workbookExporting === 'deviation-csv' ? '导出中…' : '偏离表 CSV'}
                        </button>
                        <span className="muted" style={{ fontSize: 12 }}>
                          共 {deviationTable.items.length} 条 ·{' '}
                          {deviationTable.items.filter((item) => item.deviationType === 'pending').length} 条待确认
                        </span>
                      </>
                    )}
                  </div>
                  {deviationTable && <DeviationTablePanel table={deviationTable} />}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Step 7 客户资料补齐 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${responseMatrix ? '' : 'muted-no'}`}>07</div>
          <div>
            <h2>补充资料</h2>
            <p className="hint" style={{ margin: 0 }}>
              AI 根据招标文件列出客户需要上传的信息和证明材料，上传后会自动补充到对应章节生成上下文。
            </p>
          </div>
        </div>

        {!responseMatrix ? (
          <div className="empty-tip">请先生成响应矩阵。</div>
        ) : (
          <>
            <div className="actions" style={{ marginBottom: materialChecklist ? 16 : 0 }}>
              <button
                className="btn btn-primary"
                onClick={handleGenerateMaterialChecklist}
                disabled={materialLoading}
              >
                <IconUploadCloud />
                {materialLoading ? '梳理中…' : materialChecklist ? '刷新资料清单' : 'AI 梳理需补资料'}
              </button>
              {materialChecklist && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleWorkbookExport('materials-md', api.downloadMaterialChecklistMarkdown)}
                    disabled={!!workbookExporting}
                  >
                    <IconDownload />
                    {workbookExporting === 'materials-md' ? '导出中…' : '资料清单 MD'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleWorkbookExport('materials-csv', api.downloadMaterialChecklistCsv)}
                    disabled={!!workbookExporting}
                  >
                    <IconDownload />
                    {workbookExporting === 'materials-csv' ? '导出中…' : '资料清单 CSV'}
                  </button>
                  <span className="muted" style={{ fontSize: 12 }}>
                    必需资料 {uploadedRequiredMaterials.length}/{requiredMaterials.length} 已上传
                  </span>
                </>
              )}
            </div>

            {materialChecklist && (
              <MaterialChecklistPanel
                checklist={materialChecklist}
                uploadingItemId={uploadingMaterialItemId}
                deletingFileId={deletingMaterialFileId}
                onPickFile={handlePickMaterialFile}
                onDeleteFile={handleDeleteMaterialFile}
              />
            )}
          </>
        )}
      </div>

      {/* Step 8 AI 生成正文 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${materialChecklist ? '' : 'muted-no'}`}>08</div>
          <div>
            <h2>AI 生成正文</h2>
            <p className="hint" style={{ margin: 0 }}>
              按目录逐章节生成正文，可逐节重写、手动编辑后保存。
            </p>
          </div>
        </div>

        {!outline ? (
          <div className="empty-tip">请先生成目录。</div>
        ) : !industryProfile ? (
          <div className="empty-tip">请先识别招标书行业和采购类型。</div>
        ) : !facts ? (
          <div className="empty-tip">请先在上一步生成并确认全局事实。</div>
        ) : !responseMatrix ? (
          <div className="empty-tip">请先生成响应矩阵，让正文按评分点、废标项和商务/技术条款逐项覆盖。</div>
        ) : !materialChecklist ? (
          <div className="empty-tip">请先梳理资料清单。客户上传的材料会被自动引用到对应章节。</div>
        ) : (
          <>
            {requiredMaterials.length > uploadedRequiredMaterials.length && (
              <div className="result warn" style={{ marginTop: 0 }}>
                <IconAlertTriangle />
                <span>
                  还有 {requiredMaterials.length - uploadedRequiredMaterials.length} 项必需资料未上传。可以先生成正文初稿，但相关企业信息、资质、业绩或参数可能需要后补。
                </span>
              </div>
            )}
            <ContentEditor
              projectId={current!.id}
              outline={outline}
              onChange={(o) => {
                setOutline(o);
                setOutlineDirty(true);
                setAudit(null);
                invalidateReadiness();
              }}
              onSave={() => handleSaveOutline(false)}
              saving={savingOutline}
              dirty={outlineDirty}
            />
            {done8 && (
              <div className="audit-box">
                <div className="actions">
                  <button
                    className="btn btn-ghost"
                    onClick={handleRunAudit}
                    disabled={auditLoading}
                  >
                    <IconCheckCircle />
                    {auditLoading ? '审计中…' : audit ? '重新审计全文一致性' : '全文一致性审计'}
                  </button>
                  {audit && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {audit.issues.length === 0 ? '未发现问题' : `发现 ${audit.issues.length} 条问题`}
                    </span>
                  )}
                </div>
                {audit && <AuditPanel audit={audit} />}
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 9 提交前总检 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${done8 ? '' : 'muted-no'}`}>09</div>
          <div>
            <h2>提交前总检</h2>
            <p className="hint" style={{ margin: 0 }}>
              汇总响应矩阵、必需资料、正文完成度、一致性审计和盖章状态，判断当前标书是否适合进入定稿。
            </p>
          </div>
        </div>

        {!outline ? (
          <div className="empty-tip">请先生成目录。</div>
        ) : !responseMatrix ? (
          <div className="empty-tip">请先生成响应矩阵。</div>
        ) : !materialChecklist ? (
          <div className="empty-tip">请先梳理资料清单。</div>
        ) : !done8 ? (
          <div className="empty-tip">请先完成正文生成或手动补齐空白章节。</div>
        ) : (
          <>
            <div className="actions" style={{ marginBottom: readiness ? 16 : 0 }}>
              <button className="btn btn-primary" onClick={handleRunReadiness} disabled={readinessLoading}>
                <IconCheckCircle />
                {readinessLoading ? '总检中…' : readiness ? '重新运行总检' : '运行提交前总检'}
              </button>
              {readiness && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleWorkbookExport('readiness-md', api.downloadBidReadinessMarkdown)}
                    disabled={!!workbookExporting}
                  >
                    <IconDownload />
                    {workbookExporting === 'readiness-md' ? '导出中…' : '总检 MD'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleWorkbookExport('readiness-csv', api.downloadBidReadinessCsv)}
                    disabled={!!workbookExporting}
                  >
                    <IconDownload />
                    {workbookExporting === 'readiness-csv' ? '导出中…' : '总检 CSV'}
                  </button>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {READINESS_LEVEL_LABELS[readiness.level]} · {readiness.score} 分 · {readiness.issues.length} 项提示
                  </span>
                </>
              )}
            </div>
            {readiness && <ReadinessPanel report={readiness} />}
          </>
        )}
      </div>

      {/* Step 10 导出与电子盖章 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${outline ? '' : 'muted-no'}`}>10</div>
          <div>
            <h2>导出与电子盖章</h2>
            <p className="hint" style={{ margin: 0 }}>
              将目录与正文导出为 Word 或 PDF；上传电子章后可在页面任意位置加盖并导出盖章版 PDF。
            </p>
          </div>
        </div>

        {!outline ? (
          <div className="empty-tip">请先生成目录与正文。</div>
        ) : (
          <>
            {!readiness && (
              <div className="result warn" style={{ marginTop: 0 }}>
                <IconAlertTriangle />
                <span>建议先运行提交前总检，再导出定稿。</span>
              </div>
            )}
            {readiness?.level === 'blocked' && (
              <div className="result warn" style={{ marginTop: 0 }}>
                <IconAlertTriangle />
                <span>当前总检为“暂不建议提交”，仍可导出工作稿，但建议先处理阻断问题。</span>
              </div>
            )}
            <div className="export-grid">
              <div className="export-option">
                <strong>Markdown 工作稿</strong>
                <span>保留目录和正文源码，适合版本比对、模板加工和二次编辑。</span>
                <button className="btn btn-ghost" onClick={handleExportMarkdown} disabled={!!exporting}>
                  <IconDownload />
                  {exporting === 'markdown' ? '导出中…' : '导出 Markdown'}
                </button>
              </div>
              <div className="export-option">
                <strong>可编辑稿</strong>
                <span>保留标题层级，便于继续在 Word 里精修。</span>
                <button className="btn btn-primary" onClick={handleExportDocx} disabled={!!exporting}>
                  <IconDownload />
                  {exporting === 'docx' ? '导出中…' : '导出 Word'}
                </button>
              </div>
              <div className="export-option">
                <strong>PDF 定稿</strong>
                <span>按 A4 页面生成 PDF，适合提交前检查版式。</span>
                <button className="btn btn-ghost" onClick={handleExportPdf} disabled={!!exporting}>
                  <IconDownload />
                  {exporting === 'pdf' ? '导出中…' : '导出 PDF'}
                </button>
              </div>
            </div>

            <div className="seal-workbench">
              <div className="seal-head">
                <div>
                  <h3>电子盖章</h3>
                  <p className="hint">
                    上传 PNG/JPG 印章图片后，在 A4 页面上放置印章坐标。
                  </p>
                </div>
                {sealState.seal && (
                  <button className="mini-btn danger" onClick={handleDeleteSeal} disabled={sealSaving}>
                    <IconTrash />
                    删除印章
                  </button>
                )}
              </div>

              <div className="seal-toolbar">
                <input
                  ref={sealFileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSealFile(f);
                  }}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => sealFileRef.current?.click()}
                  disabled={sealUploading || sealLoading}
                >
                  <IconUploadCloud />
                  {sealUploading ? '上传中…' : sealState.seal ? '更换电子章' : '上传电子章'}
                </button>
                {sealState.seal && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {sealState.seal.fileName} · {Math.ceil(sealState.seal.size / 1024).toLocaleString()} KB
                  </span>
                )}
              </div>

              <div className="seal-layout">
                <div
                  ref={sealPageRef}
                  className={`seal-page ${sealState.seal ? '' : 'seal-page-disabled'}`}
                  onClick={(e) => handleAddSealAt(e.clientX, e.clientY)}
                >
                  <div className="seal-paper-title">{outline.title || current?.name || '投标技术方案'}</div>
                  <div className="seal-paper-lines">
                    {(outline.nodes.length > 0 ? outline.nodes.slice(0, 9) : [{ id: 'empty', title: '投标技术方案', children: [] }]).map(
                      (node, idx) => (
                        <span key={node.id || idx} style={{ width: `${Math.max(42, 90 - idx * 5)}%` }}>
                          {node.title}
                        </span>
                      ),
                    )}
                  </div>
                  {!sealState.seal && <div className="seal-empty">未上传电子章</div>}
                  {sealImageUrl &&
                    visibleSealPlacements.map((placement) => (
                      <button
                        key={placement.id}
                        type="button"
                        className={`seal-stamp ${placement.id === activePlacementId ? 'active' : ''}`}
                        style={{
                          left: `${placement.xRatio * 100}%`,
                          top: `${placement.yRatio * 100}%`,
                          width: `${placement.widthRatio * 100}%`,
                          backgroundImage: `url(${sealImageUrl})`,
                          opacity: placement.opacity,
                          transform: `rotate(${placement.rotation}deg)`,
                        }}
                        onPointerDown={(e) => handlePlacementPointerDown(e, placement)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="电子章位置"
                      />
                    ))}
                </div>

                <div className="seal-controls">
                  <div className="field">
                    <label>页码</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={sealPage}
                      onChange={(e) => setSealPage(clamp(Number(e.target.value) || 1, 1, 20))}
                    />
                  </div>
                  <div className="field">
                    <label>印章大小</label>
                    <input
                      type="range"
                      min={0.08}
                      max={0.36}
                      step={0.01}
                      value={sealSizeValue}
                      onChange={(e) => handleSealWidthChange(Number(e.target.value))}
                    />
                  </div>
                  <div className="seal-stat">
                    <span>当前页</span>
                    <strong>{visibleSealPlacements.length}</strong>
                  </div>
                  <div className="seal-stat">
                    <span>全部</span>
                    <strong>{sealState.placements.length}</strong>
                  </div>
                  <div className="actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleRemoveActivePlacement}
                      disabled={!activePlacementId}
                    >
                      <IconTrash />
                      删除位置
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleSaveSealPlacements}
                      disabled={!sealState.seal || sealSaving}
                    >
                      <IconSave />
                      {sealSaving ? '保存中…' : '保存位置'}
                    </button>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleExportStampedPdf}
                    disabled={!sealState.seal || sealState.placements.length === 0 || !!exporting}
                  >
                    <IconDownload />
                    {exporting === 'stamped' ? '导出中…' : '导出盖章 PDF'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
