// 目录编辑器：递归渲染可编辑的章节树。支持改标题、加子节点、加同级、删除。
import type { Outline, OutlineNode } from '../types';
import { IconCornerDownRight, IconTrash, IconPlus } from './Icons';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ===== 不可变树操作（按 id） =====
function mapTree(nodes: OutlineNode[], fn: (n: OutlineNode) => OutlineNode): OutlineNode[] {
  return nodes.map((n) => fn({ ...n, children: mapTree(n.children, fn) }));
}

function updateTitle(nodes: OutlineNode[], id: string, title: string): OutlineNode[] {
  return mapTree(nodes, (n) => (n.id === id ? { ...n, title } : n));
}

function updateEstimatedWords(nodes: OutlineNode[], id: string, estimatedWords: number): OutlineNode[] {
  return mapTree(nodes, (n) => (n.id === id ? { ...n, estimatedWords } : n));
}

function removeNode(nodes: OutlineNode[], id: string): OutlineNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}

function addChild(nodes: OutlineNode[], parentId: string): OutlineNode[] {
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, estimatedWords: undefined, children: [...n.children, { id: uid(), title: '新条目', children: [], estimatedWords: 2000 }] }
      : { ...n, children: addChild(n.children, parentId) },
  );
}

function sumEstimatedWords(nodes: OutlineNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.children.length === 0) return sum + Math.max(0, Number(node.estimatedWords ?? 0));
    return sum + sumEstimatedWords(node.children);
  }, 0);
}

function NodeRow({
  node,
  depth,
  onTitle,
  onAddChild,
  onRemove,
  onEstimatedWords,
}: {
  node: OutlineNode;
  depth: number;
  onTitle: (id: string, t: string) => void;
  onAddChild: (id: string) => void;
  onRemove: (id: string) => void;
  onEstimatedWords: (id: string, words: number) => void;
}) {
  const isLeaf = node.children.length === 0;
  return (
    <div className="outline-node" style={{ marginLeft: depth * 24 }}>
      <div className="outline-row">
        <span className="outline-dot" data-depth={depth} />
        <input
          className="outline-input"
          value={node.title}
          onChange={(e) => onTitle(node.id, e.target.value)}
        />
        {isLeaf && (
          <label className="outline-words">
            <span>预计字数</span>
            <input
              type="number"
              min={300}
              max={20000}
              step={100}
              value={node.estimatedWords ?? 2000}
              onChange={(e) => onEstimatedWords(node.id, Math.max(300, Number(e.target.value) || 300))}
            />
          </label>
        )}
        <div className="outline-actions">
          {depth < 3 && (
            <button
              className="mini-btn"
              title="添加子条目"
              aria-label="添加子条目"
              onClick={() => onAddChild(node.id)}
            >
              <IconCornerDownRight />
            </button>
          )}
          <button
            className="mini-btn danger"
            title="删除"
            aria-label="删除"
            onClick={() => onRemove(node.id)}
          >
            <IconTrash />
          </button>
        </div>
      </div>
      {node.children.map((c) => (
        <NodeRow
          key={c.id}
          node={c}
          depth={depth + 1}
          onTitle={onTitle}
          onAddChild={onAddChild}
          onRemove={onRemove}
          onEstimatedWords={onEstimatedWords}
        />
      ))}
    </div>
  );
}

export default function OutlineEditor({
  outline,
  onChange,
}: {
  outline: Outline;
  onChange: (o: Outline) => void;
}) {
  const setNodes = (nodes: OutlineNode[]) => onChange({ ...outline, nodes });
  const totalWords = sumEstimatedWords(outline.nodes);

  return (
    <div className="outline-editor">
      <div className="outline-editor-head">
        <div className="field" style={{ maxWidth: 420 }}>
          <label>文档标题</label>
          <input
            value={outline.title}
            onChange={(e) => onChange({ ...outline, title: e.target.value })}
          />
        </div>
        <div className="outline-total">
          <span>预计总字数</span>
          <strong>{totalWords.toLocaleString()} 字</strong>
        </div>
      </div>

      <div className="outline-tree">
        {outline.nodes.map((n) => (
          <NodeRow
            key={n.id}
            node={n}
            depth={0}
            onTitle={(id, t) => setNodes(updateTitle(outline.nodes, id, t))}
            onAddChild={(id) => setNodes(addChild(outline.nodes, id))}
            onRemove={(id) => setNodes(removeNode(outline.nodes, id))}
            onEstimatedWords={(id, words) => setNodes(updateEstimatedWords(outline.nodes, id, words))}
          />
        ))}
      </div>

      <button
        className="btn btn-ghost btn-sm"
        onClick={() =>
          setNodes([...outline.nodes, { id: uid(), title: '新章节', children: [], estimatedWords: 2000 }])
        }
      >
        <IconPlus />
        添加一级章节
      </button>
    </div>
  );
}
