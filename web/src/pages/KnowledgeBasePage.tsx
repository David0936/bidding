import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { KnowledgeDocument, KnowledgeItem, KnowledgeOverview } from '../types';
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconDocumentText,
  IconPen,
  IconPlus,
  IconTrash,
  IconUploadCloud,
} from '../components/Icons';

function emptyOverview(): KnowledgeOverview {
  return { folders: [], documents: [], items: [] };
}

function DocumentRow({
  document,
  analyzing,
  onAnalyze,
  onDelete,
}: {
  document: KnowledgeDocument;
  analyzing: boolean;
  onAnalyze: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="kb-row">
      <IconDocumentText />
      <div>
        <strong>{document.fileName}</strong>
        <span>
          {document.fileType.toUpperCase()} · {document.charCount.toLocaleString()} 字
          {document.analyzedAt ? ' · 已整理' : ' · 待整理'}
        </span>
      </div>
      <button className="mini-btn" onClick={onAnalyze} disabled={analyzing}>
        <IconPen />
        {analyzing ? '整理中…' : document.analyzedAt ? '重新整理' : 'AI 整理'}
      </button>
      <button className="mini-btn danger" onClick={onDelete}>
        <IconTrash />
      </button>
    </div>
  );
}

function KnowledgeItemCard({ item, onDelete }: { item: KnowledgeItem; onDelete: () => void }) {
  return (
    <div className="kb-item">
      <div className="requirement-title">
        <strong>{item.title}</strong>
        <button className="mini-btn danger" onClick={onDelete}>
          <IconTrash />
        </button>
      </div>
      <p>{item.summary}</p>
      <pre>{item.content}</pre>
    </div>
  );
}

export default function KnowledgeBasePage({ onGoSettings }: { onGoSettings: () => void }) {
  const [overview, setOverview] = useState<KnowledgeOverview>(emptyOverview);
  const [currentFolderId, setCurrentFolderId] = useState('default');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState('');
  const [error, setError] = useState('');
  const [tip, setTip] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh(selectFolderId?: string) {
    const next = await api.getKnowledgeOverview();
    setOverview(next);
    const target = selectFolderId ?? currentFolderId;
    if (next.folders.some((folder) => folder.id === target)) setCurrentFolderId(target);
    else setCurrentFolderId(next.folders[0]?.id ?? 'default');
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentFolder = overview.folders.find((folder) => folder.id === currentFolderId);
  const documents = useMemo(
    () => overview.documents.filter((doc) => doc.folderId === currentFolderId),
    [overview.documents, currentFolderId],
  );
  const items = useMemo(
    () => overview.items.filter((item) => item.folderId === currentFolderId),
    [overview.items, currentFolderId],
  );

  async function handleCreateFolder() {
    const name = window.prompt('资料夹名称', '新资料夹');
    if (name === null) return;
    const folder = await api.createKnowledgeFolder(name || '新资料夹');
    await refresh(folder.id);
  }

  async function handleDeleteFolder() {
    if (!currentFolder || currentFolder.id === 'default') return;
    if (!window.confirm(`确定删除资料夹「${currentFolder.name}」？其中的文档和知识条目会一并删除。`)) return;
    await api.deleteKnowledgeFolder(currentFolder.id);
    await refresh();
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError('');
    setTip('');
    try {
      await api.uploadKnowledgeDocument(currentFolderId, file);
      setTip('文档已解析入库，可继续点击 AI 整理生成知识条目。');
      await refresh(currentFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleAnalyze(id: string) {
    setAnalyzingId(id);
    setError('');
    setTip('');
    try {
      const next = await api.analyzeKnowledgeDocument(id);
      setOverview(next);
      setTip('知识条目已整理完成，后续目录和正文生成会自动参考这些资料。');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzingId('');
    }
  }

  async function handleDeleteDocument(id: string) {
    await api.deleteKnowledgeDocument(id);
    await refresh(currentFolderId);
  }

  async function handleDeleteItem(id: string) {
    await api.deleteKnowledgeItem(id);
    await refresh(currentFolderId);
  }

  if (loading) {
    return (
      <div className="page-header">
        <h1>知识库</h1>
        <p>加载中…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>知识库</h1>
        <p>沉淀企业资料、历史方案和案例素材，生成目录与正文时自动作为参考。</p>
      </div>

      <div className="kb-layout">
        <aside className="kb-sidebar">
          <div className="actions">
            <button className="btn btn-primary btn-sm" onClick={handleCreateFolder}>
              <IconPlus />
              新建资料夹
            </button>
          </div>
          {overview.folders.map((folder) => (
            <button
              key={folder.id}
              className={`kb-folder ${folder.id === currentFolderId ? 'active' : ''}`}
              onClick={() => setCurrentFolderId(folder.id)}
            >
              <span>{folder.name}</span>
              <em>
                {overview.items.filter((item) => item.folderId === folder.id).length}
              </em>
            </button>
          ))}
          {currentFolder && currentFolder.id !== 'default' && (
            <button className="btn btn-ghost btn-sm danger" onClick={handleDeleteFolder}>
              <IconTrash />
              删除资料夹
            </button>
          )}
        </aside>

        <section className="kb-main">
          {error && (
            <div className="result err">
              <IconAlertTriangle />
              <span>{error}</span>
            </div>
          )}
          {tip && (
            <div className="result ok">
              <IconCheckCircle />
              <span>{tip}</span>
            </div>
          )}

          <div className="card" style={{ maxWidth: 920 }}>
            <div className="step-head">
              <div className="step-no">01</div>
              <div>
                <h2>上传资料</h2>
                <p className="hint" style={{ margin: 0 }}>
                  支持 PDF、Word(.docx)、txt / md。上传后先解析为 Markdown 工作稿，再由 AI 整理为知识条目。
                </p>
              </div>
            </div>

            <div
              className="dropzone"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleUpload(file);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
              <IconUploadCloud />
              <span>{uploading ? '解析中…' : '点击选择，或将资料拖拽到此处'}</span>
              <span className="dz-sub">当前资料夹：{currentFolder?.name ?? '默认资料库'}</span>
            </div>
          </div>

          <div className="card" style={{ maxWidth: 920 }}>
            <div className="step-head">
              <div className="step-no">02</div>
              <div>
                <h2>文档与条目</h2>
                <p className="hint" style={{ margin: 0 }}>
                  已整理的条目会自动进入目录和正文生成上下文。
                </p>
              </div>
            </div>

            {documents.length === 0 ? (
              <div className="empty-tip">当前资料夹还没有文档。</div>
            ) : (
              <div className="kb-list">
                {documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    document={doc}
                    analyzing={analyzingId === doc.id}
                    onAnalyze={() => handleAnalyze(doc.id)}
                    onDelete={() => handleDeleteDocument(doc.id)}
                  />
                ))}
              </div>
            )}

            <div className="kb-items-head">
              <h3>知识条目</h3>
              <span className="muted">{items.length} 条</span>
              <button className="btn btn-ghost btn-sm" onClick={onGoSettings}>
                AI 配置
              </button>
            </div>

            {items.length === 0 ? (
              <div className="empty-tip">暂无知识条目。上传文档后点击 AI 整理。</div>
            ) : (
              <div className="kb-items">
                {items.map((item) => (
                  <KnowledgeItemCard
                    key={item.id}
                    item={item}
                    onDelete={() => handleDeleteItem(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
