// 标书工作台：管理项目 + 主链路步骤。当前实现 Step1（上传解析招标文件）。
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Outline, Project } from '../types';
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
} from '../components/Icons';

export default function WorkspacePage({ onGoSettings }: { onGoSettings: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // 目录相关
  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlineDirty, setOutlineDirty] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [savingOutline, setSavingOutline] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  // 切换项目时载入已有解析文本预览 + 已有目录
  useEffect(() => {
    setPreview('');
    setOutline(null);
    setOutlineDirty(false);
    if (current?.tender) {
      api
        .getTenderText(current.id)
        .then((r) => setPreview(r.text.slice(0, 4000)))
        .catch(() => setPreview(''));
    }
    if (current) {
      api
        .getOutline(current.id)
        .then((o) => setOutline(o))
        .catch(() => setOutline(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  async function handleGenerateOutline() {
    if (!current) return;
    setGenLoading(true);
    setError('');
    try {
      const o = await api.generateOutline(current.id);
      setOutline(o);
      setOutlineDirty(false);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingOutline(false);
    }
  }

  async function handleExport() {
    if (!current) return;
    setExporting(true);
    setError('');
    try {
      // 导出前若有未保存改动，先落盘，确保导出的是最新内容
      if (outline && outlineDirty) {
        await api.saveOutline(current.id, outline);
        setOutlineDirty(false);
      }
      await api.downloadDocx(current.id, current.name || '投标技术方案');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleCreate() {
    const name = window.prompt('项目名称', '未命名标书');
    if (name === null) return;
    const p = await api.createProject(name || '未命名标书');
    await refresh(p.id);
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
      await refresh(current.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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
  const done2 = !!outline;
  const done3 = gen.total > 0 && gen.done >= gen.total;
  const currentStep = !done1 ? 1 : !done2 ? 2 : !done3 ? 3 : 4;
  const flowSteps = [
    { no: '01', name: '上传招标文件', done: done1 },
    { no: '02', name: 'AI 生成目录', done: done2 },
    { no: '03', name: 'AI 生成正文', done: done3 },
    { no: '04', name: '导出 Word', done: false },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>标书工作台</h1>
        <p>从招标文件到成稿，四步完成一份投标技术方案初稿。</p>
      </div>

      {/* 四步主链路总览 */}
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
          <button className="btn btn-ghost btn-sm danger" onClick={handleDelete}>
            <IconTrash />
            删除
          </button>
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
              支持 PDF、Word(.docx)、txt / md。上传后自动解析为纯文本，作为后续生成的依据。
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

            {preview && (
              <div className="preview-box">
                <div className="preview-title">
                  <IconEye />
                  解析文本预览（前 4000 字）
                </div>
                <pre>{preview}</pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 2 AI 生成目录 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${current?.tender ? '' : 'muted-no'}`}>02</div>
          <div>
            <h2>AI 生成目录</h2>
            <p className="hint" style={{ margin: 0 }}>
              根据招标文件生成结构化标书目录，可手动增删、改名后保存。
            </p>
          </div>
        </div>

        {!current?.tender ? (
          <div className="empty-tip">请先在上一步上传并解析招标文件。</div>
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

      {/* Step 3 AI 生成正文 */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${outline ? '' : 'muted-no'}`}>03</div>
          <div>
            <h2>AI 生成正文</h2>
            <p className="hint" style={{ margin: 0 }}>
              按目录逐章节生成正文，可逐节重写、手动编辑后保存。
            </p>
          </div>
        </div>

        {!outline ? (
          <div className="empty-tip">请先在上一步生成目录。</div>
        ) : (
          <ContentEditor
            projectId={current!.id}
            outline={outline}
            onChange={(o) => {
              setOutline(o);
              setOutlineDirty(true);
            }}
            onSave={handleSaveOutline}
            saving={savingOutline}
            dirty={outlineDirty}
          />
        )}
      </div>

      {/* Step 4 导出 Word */}
      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className={`step-no ${outline ? '' : 'muted-no'}`}>04</div>
          <div>
            <h2>导出 Word</h2>
            <p className="hint" style={{ margin: 0 }}>
              将目录与正文导出为带标题层级的 .docx 投标文件。
            </p>
          </div>
        </div>

        {!outline ? (
          <div className="empty-tip">请先生成目录与正文。</div>
        ) : (
          <div className="actions">
            <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
              <IconDownload />
              {exporting ? '导出中…' : '导出 Word（.docx）'}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              文件名：{current?.name || '投标技术方案'}.docx
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
