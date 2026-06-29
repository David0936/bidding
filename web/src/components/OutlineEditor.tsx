// 目录编辑器：递归渲染可编辑的章节树。支持改标题、加子节点、加同级、删除。
import type { Outline, OutlineNode } from '../types';

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

function removeNode(nodes: OutlineNode[], id: string): OutlineNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}

function addChild(nodes: OutlineNode[], parentId: string): OutlineNode[] {
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, { id: uid(), title: '新条目', children: [] }] }
      : { ...n, children: addChild(n.children, parentId) },
  );
}

function NodeRow({
  node,
  depth,
  onTitle,
  onAddChild,
  onRemove,
}: {
  node: OutlineNode;
  depth: number;
  onTitle: (id: string, t: string) => void;
  onAddChild: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="outline-node" style={{ marginLeft: depth * 20 }}>
      <div className="outline-row">
        <span className="outline-dot" data-depth={depth} />
        <input
          className="outline-input"
          value={node.title}
          onChange={(e) => onTitle(node.id, e.target.value)}
        />
        <div className="outline-actions">
          {depth < 3 && (
            <button className="mini-btn" title="添加子条目" onClick={() => onAddChild(node.id)}>
              ＋子
            </button>
          )}
          <button className="mini-btn danger" title="删除" onClick={() => onRemove(node.id)}>
            删
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

  return (
    <div className="outline-editor">
      <div className="field" style={{ maxWidth: 420 }}>
        <label>文档标题</label>
        <input
          value={outline.title}
          onChange={(e) => onChange({ ...outline, title: e.target.value })}
        />
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
          />
        ))}
      </div>

      <button
        className="btn btn-ghost btn-sm"
        onClick={() =>
          setNodes([...outline.nodes, { id: uid(), title: '新章节', children: [] }])
        }
      >
        ＋ 添加一级章节
      </button>
    </div>
  );
}
