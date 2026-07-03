import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { ProcurementObjectType, Project, TenderIndustryProfile } from '../types';
import { IconAlertTriangle, IconCheckCircle, IconDocumentText, IconPlus, IconUploadCloud } from '../components/Icons';

type ProjectCategoryFilter = 'all' | 'engineering' | 'goods' | 'service';
type ProjectTimeFilter = 'all' | '7d' | '1m' | '3m' | '6m' | '1y';

const CATEGORY_LABELS: Record<ProjectCategoryFilter, string> = {
  all: '全部',
  engineering: '工程类',
  goods: '货物类',
  service: '服务类',
};

const PROCUREMENT_LABELS: Record<ProcurementObjectType, string> = {
  engineering: '工程类',
  goods: '货物类',
  service: '服务类',
  software: '软件类',
  equipment: '设备类',
  epc: 'EPC/总承包',
  operation: '运营维护类',
  consulting: '咨询类',
  mixed: '综合类',
  other: '其他',
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function timeFilterStart(filter: ProjectTimeFilter): number {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (filter === '7d') return now - 7 * day;
  if (filter === '1m') return now - 31 * day;
  if (filter === '3m') return now - 93 * day;
  if (filter === '6m') return now - 186 * day;
  if (filter === '1y') return now - 366 * day;
  return 0;
}

function mapCategory(profile?: TenderIndustryProfile | null): ProjectCategoryFilter {
  if (!profile) return 'all';
  if (profile.procurementType === 'engineering' || profile.procurementType === 'epc') return 'engineering';
  if (profile.procurementType === 'goods' || profile.procurementType === 'equipment') return 'goods';
  if (
    profile.procurementType === 'service' ||
    profile.procurementType === 'software' ||
    profile.procurementType === 'operation' ||
    profile.procurementType === 'consulting'
  ) {
    return 'service';
  }
  return 'all';
}

export default function ProjectManagementPage({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Record<string, TenderIndustryProfile | null>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ProjectCategoryFilter>('all');
  const [timeFilter, setTimeFilter] = useState<ProjectTimeFilter>('all');
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const list = await api.listProjects();
      setProjects(list);
      const entries = await Promise.all(
        list.map(async (project) => {
          try {
            const profile = await api.getIndustryProfile(project.id);
            return [project.id, profile] as const;
          } catch {
            return [project.id, null] as const;
          }
        }),
      );
      setProfiles(Object.fromEntries(entries));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const start = timeFilterStart(timeFilter);
    return projects.filter((project) => {
      const profile = profiles[project.id];
      const text = [
        project.name,
        project.tender?.fileName,
        project.selectedBidSectionTitle,
        profile?.title,
        profile?.keywords.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (q && !text.includes(q)) return false;
      if (category !== 'all' && mapCategory(profile) !== category) return false;
      if (start > 0 && new Date(project.createdAt).getTime() < start) return false;
      return true;
    });
  }, [category, profiles, projects, query, timeFilter]);

  async function handleCreateProject() {
    const name = window.prompt('项目名称', '新建投标项目');
    if (name === null) return;
    setCreating(true);
    setError('');
    try {
      const project = await api.createProject(name || '新建投标项目');
      onOpenProject(project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>项目管理</h1>
        <p>集中管理投标项目，按项目类型、创建时间和名称快速定位。</p>
      </div>

      <div className="project-management-toolbar">
        <div className="project-search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="请输入项目名称" />
          <button className="btn btn-primary btn-sm" onClick={() => setQuery((current) => current.trim())}>
            搜索
          </button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleCreateProject} disabled={creating}>
          <IconPlus />
          {creating ? '创建中…' : '新建投标项目'}
        </button>
      </div>

      <div className="project-filter-panel">
        <div className="project-filter-row">
          <span>项目类型：</span>
          {(Object.keys(CATEGORY_LABELS) as ProjectCategoryFilter[]).map((item) => (
            <button className="filter-chip" data-active={category === item} onClick={() => setCategory(item)} key={item}>
              {CATEGORY_LABELS[item]}
            </button>
          ))}
        </div>
        <div className="project-filter-row">
          <span>创建时间：</span>
          {[
            ['all', '不限'],
            ['7d', '近7天'],
            ['1m', '近1月'],
            ['3m', '近3月'],
            ['6m', '近半年'],
            ['1y', '近一年'],
          ].map(([value, label]) => (
            <button className="filter-chip" data-active={timeFilter === value} onClick={() => setTimeFilter(value as ProjectTimeFilter)} key={value}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="result err">
          <IconAlertTriangle />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="empty-tip">加载项目列表…</div>
      ) : (
        <div className="project-card-grid">
          <button className="project-create-card" onClick={handleCreateProject} disabled={creating}>
            <IconUploadCloud />
            <strong>新建投标项目</strong>
            <span>上传招标文件后自动解析需求明细和行业类型</span>
          </button>

          {filteredProjects.map((project) => {
            const profile = profiles[project.id];
            return (
              <div className="project-card" key={project.id}>
                <div className="project-card-head">
                  <IconDocumentText />
                  <strong>{project.name}</strong>
                </div>
                <div className="project-card-meta">
                  <span>类型：{profile ? PROCUREMENT_LABELS[profile.procurementType] : '待识别'}</span>
                  <span>标书数量：{project.tender ? '1份' : '0份'}</span>
                  <span>消耗字数：{project.tender?.charCount.toLocaleString() ?? 0}字</span>
                  <span>创建时间：{formatTime(project.createdAt)}</span>
                </div>
                <div className="project-card-foot">
                  <span className={`badge ${project.tender ? 'badge-on' : 'badge-off'}`}>
                    {project.tender ? <IconCheckCircle /> : <IconAlertTriangle />}
                    {project.tender ? '已上传招标文件' : '待上传'}
                  </span>
                  <button className="mini-btn" onClick={() => onOpenProject(project.id)}>
                    进入项目
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
