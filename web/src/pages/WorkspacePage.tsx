// 标书工作台：管理项目 + 主链路步骤。当前实现 Step1（上传解析招标文件）。
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api } from '../api';
import type {
  ConsistencyAudit,
  GlobalFacts,
  Outline,
  Project,
  SealPlacement,
  SealState,
  TenderAnalysis,
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

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
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

export default function WorkspacePage({ onGoSettings }: { onGoSettings: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingOriginalPlan, setUploadingOriginalPlan] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [originalPlanPreview, setOriginalPlanPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const originalPlanFileRef = useRef<HTMLInputElement>(null);

  // 招标文件关键项解析
  const [analysis, setAnalysis] = useState<TenderAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // 目录相关
  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlineDirty, setOutlineDirty] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [savingOutline, setSavingOutline] = useState(false);
  const [exporting, setExporting] = useState<'markdown' | 'docx' | 'pdf' | 'stamped' | ''>('');

  // 全局事实
  const [facts, setFacts] = useState<GlobalFacts | null>(null);
  const [factsDirty, setFactsDirty] = useState(false);
  const [factsLoading, setFactsLoading] = useState(false);
  const [savingFacts, setSavingFacts] = useState(false);

  // 全文一致性审计
  const [audit, setAudit] = useState<ConsistencyAudit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

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

  async function refresh(selectId?: string) {
    const list = await api.listProjects();
    setProjects(list);
    if (selectId) setCurrentId(selectId);
    else if (!list.find((p) => p.id === currentId)) setCurrentId(list[0]?.id ?? '');
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setAnalysis(null);
    setOutline(null);
    setOutlineDirty(false);
    setFacts(null);
    setFactsDirty(false);
    setAudit(null);
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
        .getConsistencyAudit(current.id)
        .then((a) => setAudit(a))
        .catch(() => setAudit(null));
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function handleGenerateOutline() {
    if (!current) return;
    setGenLoading(true);
    setError('');
    try {
      const o = await api.generateOutline(current.id);
      setOutline(o);
      setOutlineDirty(false);
      setFacts(null);
      setFactsDirty(false);
      setAudit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenLoading(false);
    }
  }

  async function handleSaveOutline() {
    if (!current || !outline) return;
    setSavingOutline(true);
    try {
      const o = await api.saveOutline(current.id, outline);
      setOutline(o);
      setOutlineDirty(false);
      setAudit(null);
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
      setAudit(null);
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
      setAudit(null);
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
        await api.saveOutline(current.id, outline);
        setOutlineDirty(false);
      }
      if (facts && factsDirty) {
        await api.saveGlobalFacts(current.id, facts);
        setFactsDirty(false);
      }
      const result = await api.runConsistencyAudit(current.id);
      setAudit(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuditLoading(false);
    }
  }

  async function persistOutlineBeforeExport() {
    if (!current || !outline || !outlineDirty) return;
    const saved = await api.saveOutline(current.id, outline);
    setOutline(saved);
    setOutlineDirty(false);
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
    try {
      const res = await api.uploadTender(current.id, file);
      setPreview(res.preview);
      setAnalysis(null);
      setOutline(null);
      setOutlineDirty(false);
      setFacts(null);
      setFactsDirty(false);
      setAudit(null);
      await refresh(current.id);
    } catch (e) {
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
      setOutline(null);
      setOutlineDirty(false);
      setFacts(null);
      setFactsDirty(false);
      setAudit(null);
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
      setOutline(null);
      setOutlineDirty(false);
      setFacts(null);
      setFactsDirty(false);
      setAudit(null);
      await refresh(current.id);
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
      await refresh(current.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSealSaving(false);
    }
  }

  function updatePlacement(id: string, patch: Partial<SealPlacement>) {
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
  const done3 = !!outline;
  const done4 = !!facts && facts.items.length > 0;
  const done5 = gen.total > 0 && gen.done >= gen.total;
  const currentStep = !done1 ? 1 : !done2 ? 2 : !done3 ? 3 : !done4 ? 4 : !done5 ? 5 : 6;
  const flowSteps = [
    { no: '01', name: '上传招标文件', done: done1 },
    { no: '02', name: '解析关键项', done: done2 },
    { no: '03', name: 'AI 生成目录', done: done3 },
    { no: '04', name: '全局事实', done: done4 },
    { no: '05', name: 'AI 生成正文', done: done5 },
    { no: '06', name: '导出/盖章', done: false },
  ];
  const activePlacement = sealState.placements.find((placement) => placement.id === activePlacementId) ?? null;
  const visibleSealPlacements = sealState.placements.filter((placement) => placement.page === sealPage);
  const sealSizeValue = activePlacement?.widthRatio ?? sealWidth;

  return (
    <div>
      <div className="page-header">
        <h1>标书工作台</h1>
        <p>从招标文件到成稿，按“解析、目录、事实、正文、导出”的链路完成投标技术方案初稿。</p>
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

      {/* Step 1 上传招标文件 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className="step-no">01</div>
          <div>
            <h2>上传招标文件</h2>
            <p className="hint" style={{ margin: 0 }}>
              支持 PDF、Word(.docx)、txt / md。上传后自动解析为 Markdown 工作稿，作为后续生成的依据。
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
                <span>解析中…</span>
              ) : (
                <span>点击选择，或将文件拖拽到此处</span>
              )}
              <span className="dz-sub">支持 PDF / Word(.docx) / txt / md</span>
            </div>

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

      {/* Step 3 AI 生成目录 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${analysis ? '' : 'muted-no'}`}>03</div>
          <div>
            <h2>AI 生成目录</h2>
            <p className="hint" style={{ margin: 0 }}>
              根据招标文件生成结构化标书目录，可手动增删、改名后保存。
            </p>
          </div>
        </div>

        {!analysis ? (
          <div className="empty-tip">请先在上一步解析招标文件关键项。</div>
        ) : (
          <>
            <div className="actions" style={{ marginBottom: outline ? 16 : 0 }}>
              <button
                className="btn btn-primary"
                onClick={handleGenerateOutline}
                disabled={genLoading}
              >
                <IconPen />
                {genLoading ? 'AI 生成中…' : outline ? '重新生成目录' : 'AI 生成目录'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onGoSettings}>
                <IconSettings />
                AI 配置
              </button>
              {outline && (
                <span className="muted" style={{ fontSize: 12 }}>
                  共 {outline.nodes.length} 个一级章节
                </span>
              )}
            </div>

            {outline && (
              <>
                <OutlineEditor
                  outline={outline}
                  onChange={(o) => {
                    setOutline(o);
                    setOutlineDirty(true);
                    setAudit(null);
                  }}
                />
                <div className="actions" style={{ marginTop: 16 }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveOutline}
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

      {/* Step 4 全局事实 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${outline ? '' : 'muted-no'}`}>04</div>
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
                  setAudit(null);
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Step 5 AI 生成正文 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${facts ? '' : 'muted-no'}`}>05</div>
          <div>
            <h2>AI 生成正文</h2>
            <p className="hint" style={{ margin: 0 }}>
              按目录逐章节生成正文，可逐节重写、手动编辑后保存。
            </p>
          </div>
        </div>

        {!outline ? (
          <div className="empty-tip">请先生成目录。</div>
        ) : !facts ? (
          <div className="empty-tip">请先在上一步生成并确认全局事实。</div>
        ) : (
          <>
            <ContentEditor
              projectId={current!.id}
              outline={outline}
              onChange={(o) => {
                setOutline(o);
                setOutlineDirty(true);
                setAudit(null);
              }}
              onSave={handleSaveOutline}
              saving={savingOutline}
              dirty={outlineDirty}
            />
            {done5 && (
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

      {/* Step 6 导出与电子盖章 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${outline ? '' : 'muted-no'}`}>06</div>
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
