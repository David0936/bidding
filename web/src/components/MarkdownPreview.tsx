// 正文 Markdown 预览：按块渲染段落/小标题/列表/表格，material:// 图片走鉴权接口取 Blob。
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { parseMarkdownBlocks, parseMaterialRef, splitBoldSegments } from '../lib/markdown';

// 已加载图片的 objectURL 缓存（组件间共享，避免重复请求）
const imageUrlCache = new Map<string, string>();

function BoldText({ text }: { text: string }) {
  return (
    <>
      {splitBoldSegments(text).map((seg, i) =>
        seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

function MaterialImage({ projectId, alt, refUri }: { projectId: string; alt: string; refUri: string }) {
  const [url, setUrl] = useState<string | null>(imageUrlCache.get(`${projectId}:${refUri}`) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cacheKey = `${projectId}:${refUri}`;
    if (imageUrlCache.has(cacheKey)) {
      setUrl(imageUrlCache.get(cacheKey)!);
      return;
    }
    const parsed = parseMaterialRef(refUri);
    if (!parsed) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    api
      .getMaterialFileBlob(projectId, parsed.itemId, parsed.fileId)
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        imageUrlCache.set(cacheKey, objectUrl);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refUri]);

  if (failed) {
    return <div className="md-image-missing">【图片：{alt || refUri}（未找到，请在资料清单中确认）】</div>;
  }
  if (!url) {
    return <div className="md-image-loading">图片加载中…</div>;
  }
  return (
    <figure className="md-image">
      <img src={url} alt={alt} />
      {alt && <figcaption>{alt}</figcaption>}
    </figure>
  );
}

export default function MarkdownPreview({
  projectId,
  markdown,
}: {
  projectId: string;
  markdown: string;
}) {
  const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);

  if (blocks.length === 0) {
    return <div className="md-preview md-preview-empty">（暂无内容）</div>;
  }

  return (
    <div className="md-preview">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <h4 key={i}>
                <BoldText text={block.text} />
              </h4>
            );
          case 'bullet':
            return (
              <li key={i}>
                <BoldText text={block.text} />
              </li>
            );
          case 'ordered':
            return (
              <div className="md-ordered" key={i}>
                <BoldText text={block.text} />
              </div>
            );
          case 'table':
            return (
              <table className="md-table" key={i}>
                <thead>
                  <tr>
                    {block.headers.map((cell, c) => (
                      <th key={c}>
                        <BoldText text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c}>
                          <BoldText text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case 'image':
            return <MaterialImage key={i} projectId={projectId} alt={block.alt} refUri={block.ref} />;
          default:
            return (
              <p key={i}>
                <BoldText text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
