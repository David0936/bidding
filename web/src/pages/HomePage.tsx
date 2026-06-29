// 标书工作台首页：展示主链路四个步骤（M2~M5 逐步实现）
export default function HomePage({ onGoSettings }: { onGoSettings: () => void }) {
  const steps = [
    { no: 1, title: '上传招标文件', desc: '导入 PDF / Word 招标文件并自动解析为文本。' },
    { no: 2, title: 'AI 生成目录', desc: '根据招标要求生成结构化标书目录，可手动调整。' },
    { no: 3, title: 'AI 生成正文', desc: '按目录逐章节生成正文内容，支持编辑完善。' },
    { no: 4, title: '导出 Word', desc: '一键导出带标题层级的 .docx 投标文件。' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>标书工作台</h1>
        <p>从招标文件到成稿，四步完成一份投标技术方案初稿。</p>
      </div>

      <div className="card" style={{ maxWidth: 920 }}>
        <h2>主链路</h2>
        <p className="hint">
          首版聚焦核心生成链路。开始前请先到「设置」配置 AI 模型（支持 OpenAI 兼容与 Claude 两种格式）。
        </p>
        <div className="steps">
          {steps.map((s) => (
            <div className="step-card" key={s.no}>
              <div className="step-no">{s.no}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="actions" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={onGoSettings}>
            先去配置 AI 模型
          </button>
        </div>
      </div>
    </div>
  );
}
