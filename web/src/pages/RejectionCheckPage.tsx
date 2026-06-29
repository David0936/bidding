import { useState } from 'react';
import { api } from '../api';
import type { RejectionCheckResult } from '../types';
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconDocumentText,
  IconUploadCloud,
} from '../components/Icons';

export default function RejectionCheckPage({ onGoSettings }: { onGoSettings: () => void }) {
  const [tender, setTender] = useState<File | null>(null);
  const [bid, setBid] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RejectionCheckResult | null>(null);

  async function handleCheck() {
    if (!tender || !bid) return;
    setChecking(true);
    setError('');
    setResult(null);
    try {
      const res = await api.runRejectionCheck(tender, bid);
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
        <h1>废标项检查</h1>
        <p>依据招标文件的无效投标、废标条款和关键响应要求，检查投标文件正文风险。</p>
      </div>

      <div className="card" style={{ maxWidth: 920 }}>
        <div className="step-head">
          <div className="step-no">01</div>
          <div>
            <h2>选择文件</h2>
            <p className="hint" style={{ margin: 0 }}>
              招标文件和投标文件各上传一份；本检查聚焦电子正文，不判断纸质签字盖章事项。
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
            <span>招标文件</span>
            <strong>{tender?.name ?? '未选择'}</strong>
          </label>

          <label className="upload-field">
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => setBid(e.target.files?.[0] ?? null)}
            />
            <IconUploadCloud />
            <span>投标文件</span>
            <strong>{bid?.name ?? '未选择'}</strong>
          </label>
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={handleCheck} disabled={!tender || !bid || checking}>
            <IconCheckCircle />
            {checking ? '检查中…' : '开始检查'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onGoSettings}>
            AI 配置
          </button>
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
              <h2>检查结果</h2>
              <p className="hint" style={{ margin: 0 }}>
                {result.tenderFileName} / {result.bidFileName}
              </p>
            </div>
          </div>

          <div className="analysis-summary">
            <strong>摘要</strong>
            <p>{result.summary}</p>
          </div>

          {result.issues.length === 0 ? (
            <div className="empty-tip">未发现明显废标风险。</div>
          ) : (
            <div className="duplicate-list">
              {result.issues.map((issue, idx) => (
                <div className="duplicate-item" key={`${issue.title}-${idx}`}>
                  <div className="duplicate-head">
                    <span className="content-idx">{idx + 1}</span>
                    <strong>{issue.title}</strong>
                    <span className={`badge ${issue.severity === 'high' ? 'badge-warn' : 'badge-off'}`}>
                      {issue.type} · {issue.severity}
                    </span>
                  </div>
                  <p>{issue.requirement}</p>
                  {issue.evidence && <pre className="audit-quote">{issue.evidence}</pre>}
                  <p>
                    <strong>建议：</strong>
                    {issue.suggestion}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
