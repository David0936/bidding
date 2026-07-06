// 正文编辑器：按目录叶子逐节生成正文，支持一键全生成、单节重生成、手动编辑、保存。
// 编辑区带格式工具栏（加粗/小标题/列表/表格）与「预览」模式，预览渲染表格与证照图片。
import { useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { Outline } from '../types';
import { collectLeaves, setNodeContent, countGenerated } from '../lib/outlineTree';
import { IconPen, IconSave, IconCheckCircle, IconAlertTriangle } from './Icons';
import MarkdownPreview from './MarkdownPreview';

const TABLE_TEMPLATE = [
  '| 项目 | 内容 | 备注 |',
  '| --- | --- | --- |',
  '|  |  |  |',
  '|  |  |  |',
].join('\n');

function SectionEditor({
  projectId,
  content,
  onChange,
}: {
  projectId: string;
  content: string;
  onChange: (value: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** 在光标处插入文本；wrap 模式把选中文本包裹在 before/after 之间 */
  function insertAtCursor(before: string, after = '', block = false) {
    const el = textareaRef.current;
    if (!el) {
      onChange(content + (block ? `\n\n${before}\n` : before));
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const selected = content.slice(start, end);
    let inserted: string;
    if (block) {
      const prefix = content.slice(0, start).trimEnd();
      inserted = `${prefix ? `${prefix}\n\n` : ''}${before}\n${content.slice(end).trimStart()}`;
      onChange(inserted);
      return;
    }
    inserted = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
    onChange(inserted);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length + selected.length + after.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="section-editor">
      <div className="editor-toolbar">
        <button className="mini-btn" title="加粗" onClick={() => insertAtCursor('**', '**')} disabled={preview}>
          <b>B</b>
        </button>
        <button className="mini-btn" title="小标题" onClick={() => insertAtCursor('\n### ', '')} disabled={preview}>
          H
        </button>
        <button className="mini-btn" title="无序列表" onClick={() => insertAtCursor('\n- ', '')} disabled={preview}>
          • 列表
        </button>
        <button className="mini-btn" title="插入表格" onClick={() => insertAtCursor(TABLE_TEMPLATE, '', true)} disabled={preview}>
          表格
        </button>
        <span className="editor-toolbar-spacer" />
        <button className={`mini-btn ${preview ? 'mini-btn-active' : ''}`} onClick={() => setPreview((v) => !v)}>
          {preview ? '返回编辑' : '预览'}
        </button>
      </div>
      {preview ? (
        <div className="content-preview">
          <MarkdownPreview projectId={projectId} markdown={content} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="content-textarea"
          value={content}
          placeholder="（尚未生成正文，可点击「生成本节」或一键生成；支持 Markdown 表格与资料图片引用）"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export default function ContentEditor({
  projectId,
  outline,
  onChange,
  onSave,
  saving,
  dirty,
}: {
  projectId: string;
  outline: Outline;
  onChange: (o: Outline) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const leaves = useMemo(() => collectLeaves(outline.nodes), [outline]);
  const { total, done } = countGenerated(outline);
  const [busyAll, setBusyAll] = useState(false);
  const [busyNode, setBusyNode] = useState<string>('');
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');

  async function genOne(nodeId: string) {
    const res = await api.generateSection(projectId, nodeId);
    // 后端已落盘，这里同步更新本地 outline
    onChange({ ...outline, nodes: setNodeContent(outline.nodes, nodeId, res.content) });
    return res;
  }

  async function handleGenerateAll() {
    setBusyAll(true);
    setErr('');
    try {
      // 重新从最新 outline 取叶子顺序
      const targets = collectLeaves(outline.nodes);
      for (let i = 0; i < targets.length; i++) {
        setProgress(`正在生成 ${i + 1}/${targets.length}：${targets[i].node.title}`);
        await genOne(targets[i].node.id);
      }
      setProgress(`已完成全部 ${targets.length} 节正文`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAll(false);
    }
  }

  async function handleRegen(nodeId: string) {
    setBusyNode(nodeId);
    setErr('');
    try {
      await genOne(nodeId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyNode('');
    }
  }

  return (
    <div>
      <div className="actions" style={{ marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={handleGenerateAll} disabled={busyAll}>
          <IconPen />
          {busyAll ? '生成中…' : '一键生成全部正文'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onSave}
          disabled={saving || !dirty}
        >
          <IconSave />
          {saving ? '保存中…' : dirty ? '保存正文' : '已保存'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          进度 {done}/{total}
        </span>
      </div>

      {busyAll && progress && (
        <div className="result ok" style={{ marginTop: 0 }}>
          <IconCheckCircle />
          <span>{progress}</span>
        </div>
      )}
      {err && (
        <div className="result err">
          <IconAlertTriangle />
          <span>{err}</span>
        </div>
      )}

      <div className="content-list">
        {leaves.map((leaf, idx) => {
          const content = leaf.node.content ?? '';
          const filled = content.trim().length > 0;
          return (
            <div className="content-item" key={leaf.node.id}>
              <div className="content-head">
                <span className="content-idx">{idx + 1}</span>
                <span className="content-path">{leaf.path.join(' / ')}</span>
                <span className={`badge ${filled ? 'badge-on' : 'badge-warn'}`}>
                  {filled && <IconCheckCircle />}
                  {filled ? '已生成' : '待生成'}
                </span>
                {leaf.node.estimatedWords && (
                  <span className="badge badge-off">约 {leaf.node.estimatedWords.toLocaleString()} 字</span>
                )}
                <button
                  className="mini-btn"
                  onClick={() => handleRegen(leaf.node.id)}
                  disabled={busyNode === leaf.node.id || busyAll}
                >
                  <IconPen />
                  {busyNode === leaf.node.id ? '生成中…' : filled ? '重新生成' : '生成本节'}
                </button>
              </div>
              <SectionEditor
                projectId={projectId}
                content={content}
                onChange={(value) =>
                  onChange({
                    ...outline,
                    nodes: setNodeContent(outline.nodes, leaf.node.id, value),
                  })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
