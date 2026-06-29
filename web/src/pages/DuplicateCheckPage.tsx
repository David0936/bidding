import { useMemo, useState } from 'react';
import { api } from '../api';
import type { DuplicateCheckResult } from '../types';
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconDocumentText,
  IconUploadCloud,
} from '../components/Icons';

function fileNames(files: File[]): string {
  return files.length === 0 ? '未选择' : files.map((file) => file.name).join('、');
}

export default function DuplicateCheckPage() {
  const [tender, setTender] = useState<File | null>(null);
  const [bids, setBids] = useState<File[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DuplicateCheckResult | null>(null);

  const canCheck = bids.length >= 2 && !checking;
  const topGroups = useMemo(() => result?.groups ?? [], [result]);

  async function handleCheck() {
    setChecking(true);
    setError('');
    setResult(null);
    try {
      const res = await api.runDuplicateCheck(tender, bids);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>标书查重</h1>
        <p>从正文句子维度交叉比对多份投标文件；招标文件中出现过的句子会自动排除。</p>
      </div>

      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className="step-no">01</div>
          <div>
            <h2>选择文件</h2>
            <p className="hint" style={{ margin: 0 }}>
              可选上传招标文件作为排除源；投标文件至少上传两份。
            </p>
          </div>
        </div>

        <div className="check-upload-grid">
          <label className="upload-field">
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => setTender(e.target.files?.[0] ?? null)}
            />
            <IconDocumentText />
            <span>招标文件（可选）</span>
            <strong>{tender?.name ?? '未选择'}</strong>
          </label>

          <label className="upload-field">
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              multiple
              onChange={(e) => setBids(Array.from(e.target.files ?? []))}
            />
            <IconUploadCloud />
            <span>投标文件（至少 2 份）</span>
            <strong>{fileNames(bids)}</strong>
          </label>
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={handleCheck} disabled={!canCheck}>
            <IconCheckCircle />
            {checking ? '查重中…' : '开始查重'}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            当前投标文件 {bids.length} 份
          </span>
        </div>

        {error && (
          <div className="result err">
            <IconAlertTriangle />
            <span>{error}</span>
          </div>
        )}
      </div>

      {result && (
        <div className="card" style={{ maxWidth: 920 }}>
          <div className="step-head">
            <div className="step-no">02</div>
            <div>
              <h2>查重结果</h2>
              <p className="hint" style={{ margin: 0 }}>
                已排除招标文件句子 {result.tenderExcludedSentenceCount} 条，发现重复句子 {result.duplicateSentenceCount} 条。
              </p>
            </div>
          </div>

          <div className="file-code-list">
            {result.files.map((file) => (
              <div className="file-code" key={file.id}>
                <span>{file.id}</span>
                <strong>{file.name}</strong>
                <em>{file.sentenceCount.toLocaleString()} 句</em>
              </div>
            ))}
          </div>

          {topGroups.length === 0 ? (
            <div className="empty-tip">未发现多份投标文件之间的重复句子。</div>
          ) : (
            <div className="duplicate-list">
              {topGroups.map((group, idx) => (
                <div className="duplicate-item" key={`${group.sentence}-${idx}`}>
                  <div className="duplicate-head">
                    <span className="content-idx">{idx + 1}</span>
                    <span className="badge badge-warn">重复于 {group.files.join(' / ')}</span>
                  </div>
                  <p>{group.sentence}</p>
                  <span className="muted">文件：{group.fileNames.join('、')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
