'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import {
  Cpu,
  Download,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  HardDriveDownload,
  AlertTriangle,
  Palette,
  Plus,
  Trash2,
  Star,
  Image as ImageIcon,
  FolderOpen,
  Upload,
  FileDown,
  Link2,
  FileVideo,
  Sparkles,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* 桌面 bridge 类型（仅 macOS 客户端注入 preload-web.js 时存在）        */
/* ------------------------------------------------------------------ */

interface LocalModelInfo {
  id: string;
  label: string;
  file: string;
  path: string;
  bytes: number;
  minBytes: number;
  ready: boolean;
}

interface LocalEngineInfo {
  available: boolean;
  engine: string;
  binary: string;
  modelId: string | null;
  modelPath: string | null;
}

interface LocalModelsStatus {
  modelsDir: string;
  binDir: string;
  defaultModelId: string;
  models: LocalModelInfo[];
  readyCount: number;
  totalBytes: number;
  engine: LocalEngineInfo;
}

interface LocalModelProgress {
  id?: string;
  stage?: 'downloading' | 'ready';
  pct?: number;
  file?: string;
  received?: number;
  total?: number;
}

/* ------------------------------------------------------------------ */
/* P0-1 品牌套件 Brand Kit（本地 JSON，零上传；仅桌面客户端读写）        */
/* ------------------------------------------------------------------ */

interface BrandSubtitle {
  size: 'small' | 'medium' | 'large';
  outline: 'none' | 'light' | 'bold';
  background: 'none' | 'bar';
  highlight: 'yellow' | 'cyan' | 'pink' | 'green' | 'orange';
}

interface BrandIntro {
  enabled: boolean;
  text: string;
  seconds: number;
}

interface BrandOutro {
  enabled: boolean;
  text: string;
}

interface BrandLogo {
  path: string;
  position: 'br' | 'bl' | 'tr' | 'tl';
  widthPct: number;
  opacity: number;
}

interface Brand {
  id: string;
  name: string;
  font: string;
  primaryColor: string;
  subtitle: BrandSubtitle;
  intro: BrandIntro;
  outro: BrandOutro;
  logo: BrandLogo;
}

interface BrandKitList {
  brands: Brand[];
  activeId: string;
  fonts: string[];
  empty: boolean;
}

interface BrandKitBridge {
  brandKitList: () => Promise<BrandKitList>;
  brandKitGetActive: () => Promise<Brand>;
  brandKitSave: (brand: Brand) => Promise<{ ok: boolean; brand?: Brand }>;
  brandKitRemove: (id: string) => Promise<{ ok: boolean; activeId?: string; brands?: Brand[] }>;
  brandKitSetActive: (id: string) => Promise<{ ok: boolean; activeId?: string }>;
  brandKitPickLogo: () => Promise<{ ok: boolean; path?: string; canceled?: boolean; code?: string; message?: string }>;
}

/* ------------------------------------------------------------------ */
/* P0-2 本地工程文件 Project as File（单个 .clipop，零上传）           */
/* ------------------------------------------------------------------ */

interface ProjectMaterial {
  id: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  duration: number;
  addedAt: string;
}

interface ProjectClip {
  id: string;
  materialId: string;
  start: number;
  end: number;
  title: string;
  summary: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'deferred';
  score: number;
}

interface Project {
  format: string;
  version: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  brandId: string;
  settings: { aspect: string; quality: string; locale: string };
  materials: ProjectMaterial[];
  clips: ProjectClip[];
}

interface ProjectSummary {
  id: string;
  name: string;
  brandId: string;
  createdAt: string;
  updatedAt: string;
  materialCount: number;
  clipCount: number;
  missingCount: number;
}

interface MissingMaterial {
  id: string;
  fileName: string;
  filePath: string;
}

interface ProjectReadResult {
  ok: boolean;
  project: Project;
  path: string;
  workspace: boolean;
  missing: MissingMaterial[];
}

interface ProjectBridge {
  projectList: () => Promise<{ projects: ProjectSummary[]; dir: string }>;
  projectCreate: (input: { name?: string }) => Promise<{ ok: boolean; project?: Project }>;
  projectRead: (input: { id: string }) => Promise<ProjectReadResult>;
  projectSave: (input: { project: Project }) => Promise<{ ok: boolean; project?: Project }>;
  projectRemove: (id: string) => Promise<{ ok: boolean }>;
  projectImport: () => Promise<{ ok: boolean; project?: Project; canceled?: boolean; message?: string }>;
  projectExport: (id: string) => Promise<{ ok: boolean; path?: string; canceled?: boolean; message?: string }>;
  projectRelink: (input: { id: string; materialId: string }) => Promise<{
    ok: boolean;
    project?: Project;
    missing?: MissingMaterial[];
    canceled?: boolean;
    message?: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* P0-4 首片 5 分钟 Aha 引擎（一键出可直接发布成片，零上传）           */
/* ------------------------------------------------------------------ */

interface AhaSource {
  path: string;
  name: string;
  duration: number;
  bytes: number;
}

interface AhaSpec {
  clip: { start: number; end: number };
  title: string;
  score: number;
  reason: string[];
  noTranscript: boolean;
  usedFallback: boolean;
  candidateCount: number;
  aspect: string;
  plan: string;
  quality: string;
  subtitleCueCount: number;
  subtitleWordCount: number;
}

interface AhaTimings {
  stageMs: Record<string, number>;
  totalMs: number;
  totalSec: number;
  budgetSec: number;
  withinBudget: boolean;
}

interface AhaResult {
  ok: boolean;
  spec?: AhaSpec;
  render?: PublishableRender;
  timings?: AhaTimings;
  videoUrl?: string;
  code?: string;
  message?: string;
}

interface PublishableRender {
  outputPath: string;
  outputName: string;
  width: number;
  height: number;
  duration: number;
  label: string;
  aspect: string;
  watermark: boolean;
  subtitles: boolean;
  jumpCut: { disabled: boolean; reason: string; removedSec: number };
  warnings: string[];
}

interface AhaBridge {
  ahaPickVideo: () => Promise<{
    ok: boolean;
    path?: string;
    name?: string;
    duration?: number;
    bytes?: number;
    canceled?: boolean;
  }>;
  ahaFirstClip: (input: {
    inputPath: string;
    locale?: string;
    quality?: string;
    aspect?: string;
    plan?: string;
  }) => Promise<AhaResult>;
  ahaExport: (input: { outputPath: string; suggestedName?: string }) => Promise<{
    ok: boolean;
    path?: string;
    canceled?: boolean;
    code?: string;
    message?: string;
  }>;
}

interface LocalEngineBridge extends BrandKitBridge, ProjectBridge, AhaBridge {
  localModelsStatus: () => Promise<LocalModelsStatus>;
  localModelsPrepare: (ids?: string[]) => Promise<{ ok: boolean }>;
  onLocalModelsProgress: (cb: (p: LocalModelProgress) => void) => () => void;
}

function getDesktopBridge(): LocalEngineBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    clipopDesktop?: Partial<LocalEngineBridge>;
    vidshorterDesktop?: Partial<LocalEngineBridge>;
  };
  const b = w.clipopDesktop || w.vidshorterDesktop;
  return b && typeof b.localModelsStatus === 'function' ? (b as LocalEngineBridge) : null;
}

function logoBasename(p: string): string {
  const s = String(p || '').trim();
  if (!s) return '';
  const parts = s.split(/[\\/]/);
  return parts[parts.length - 1] || s;
}

function newBrandDraft(): Brand {
  return {
    id: `brand_${Date.now().toString(36)}`,
    name: '',
    font: 'PingFang SC',
    primaryColor: '',
    subtitle: { size: 'medium', outline: 'bold', background: 'bar', highlight: 'yellow' },
    intro: { enabled: true, text: '', seconds: 3 },
    outro: { enabled: true, text: '' },
    logo: { path: '', position: 'br', widthPct: 14, opacity: 1 },
  };
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

/* 引擎注册表里带的 label 是构建期固定文案，这里按 id 走 i18n，缺失时再回落。 */
const MODEL_LABEL_KEY: Record<string, string> = {
  'whisper-tiny': 'localEngine.modelTiny',
  'whisper-base': 'localEngine.modelBase',
  'whisper-small': 'localEngine.modelSmall',
};

export default function LocalEnginePage() {
  const { t, locale } = useLocale();
  const tr = useCallback(
    (key: string, fallback?: string) => {
      const s = t(key);
      return s === key ? (fallback ?? '') : s;
    },
    [t],
  );

  const bridgeRef = useRef<LocalEngineBridge | null>(null);
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null);
  const [status, setStatus] = useState<LocalModelsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [progressById, setProgressById] = useState<Record<string, LocalModelProgress>>({});

  /* 品牌套件状态 */
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrandId, setActiveBrandId] = useState('');
  const [fonts, setFonts] = useState<string[]>([]);
  const [brandReady, setBrandReady] = useState(false);
  const [draft, setDraft] = useState<Brand | null>(null);
  const [brandBusy, setBrandBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [brandMsg, setBrandMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  /* 工程文件状态 */
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectDir, setProjectDir] = useState('');
  const [projectReady, setProjectReady] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState('');
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectMsg, setProjectMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  /* 首片 Aha 引擎状态 */
  const [ahaSource, setAhaSource] = useState<AhaSource | null>(null);
  const [ahaQuality, setAhaQuality] = useState('balanced');
  const [ahaRunning, setAhaRunning] = useState(false);
  const [ahaElapsed, setAhaElapsed] = useState(0);
  const [ahaResult, setAhaResult] = useState<AhaResult | null>(null);
  const [ahaMsg, setAhaMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refreshBrands = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.brandKitList) return;
    try {
      const data = await bridge.brandKitList();
      setBrands(data.brands || []);
      setActiveBrandId(data.activeId || '');
      setFonts(data.fonts || []);
      setBrandReady(true);
      setDraft((prev) => {
        if (prev && (data.brands || []).some((b) => b.id === prev.id)) return prev;
        const first = (data.brands || [])[0] || null;
        return first;
      });
    } catch (err) {
      setBrandMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    }
  }, []);

  const refresh = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    setLoading(true);
    setError('');
    try {
      setStatus(await bridge.localModelsStatus());
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  const applyProject = useCallback((res: ProjectReadResult) => {
    setActiveProject(res.project || null);
    setProjectName(res.project?.name || '');
    setMissingIds((res.missing || []).map((m) => m.id));
  }, []);

  const refreshProjects = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.projectList) return;
    try {
      const data = await bridge.projectList();
      setProjects(data.projects || []);
      setProjectDir(data.dir || '');
      setProjectReady(true);
    } catch (err) {
      setProjectMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    }
  }, []);

  const selectProject = useCallback(
    async (id: string) => {
      const bridge = bridgeRef.current;
      if (!bridge?.projectRead) return;
      setProjectMsg(null);
      try {
        const res = await bridge.projectRead({ id });
        if (res?.ok) applyProject(res);
      } catch (err) {
        setProjectMsg({ kind: 'err', text: String((err as Error)?.message || err) });
      }
    },
    [applyProject],
  );

  useEffect(() => {
    const bridge = getDesktopBridge();
    bridgeRef.current = bridge;
    setBridgeReady(Boolean(bridge));
    if (!bridge) return;

    void refresh();
    void refreshBrands();
    void refreshProjects();

    const off = bridge.onLocalModelsProgress((p) => {
      if (!p || !p.id) return;
      setProgressById((prev) => ({ ...prev, [p.id as string]: p }));
    });
    return off;
  }, [refresh, refreshBrands, refreshProjects]);

  const handleDownload = useCallback(
    async (ids: string[], id: string) => {
      const bridge = bridgeRef.current;
      if (!bridge || downloadingId) return;
      setDownloadingId(id);
      setError('');
      setProgressById((prev) => ({ ...prev, [id]: { id, stage: 'downloading', pct: 0 } }));
      try {
        await bridge.localModelsPrepare(ids);
        await refresh();
      } catch (err) {
        setError(String((err as Error)?.message || err));
      } finally {
        setDownloadingId('');
      }
    },
    [downloadingId, refresh],
  );

  /* ----------------------------- 品牌套件操作 ----------------------------- */

  const patchDraft = useCallback((patch: Partial<Brand>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleSaveBrand = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.brandKitSave || !draft) return;
    setBrandBusy(true);
    setBrandMsg(null);
    try {
      const name = draft.name.trim();
      if (!name) {
        setBrandMsg({ kind: 'err', text: tr('brandKit.errName', 'Brand name is required.') });
        return;
      }
      const res = await bridge.brandKitSave({ ...draft, name });
      if (!res?.ok) throw new Error('save_failed');
      await refreshBrands();
      setBrandMsg({ kind: 'ok', text: tr('brandKit.saved', 'Brand saved. New exports use it automatically.') });
    } catch (err) {
      setBrandMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    } finally {
      setBrandBusy(false);
    }
  }, [draft, refreshBrands, tr]);

  const handleDeleteBrand = useCallback(
    async (id: string) => {
      const bridge = bridgeRef.current;
      if (!bridge?.brandKitRemove) return;
      if (!window.confirm(tr('brandKit.confirmDelete', 'Delete this brand kit? This cannot be undone.'))) return;
      setBrandBusy(true);
      setBrandMsg(null);
      try {
        await bridge.brandKitRemove(id);
        setDraft(null);
        await refreshBrands();
      } catch (err) {
        setBrandMsg({ kind: 'err', text: String((err as Error)?.message || err) });
      } finally {
        setBrandBusy(false);
      }
    },
    [refreshBrands, tr],
  );

  const handleSetActiveBrand = useCallback(
    async (id: string) => {
      const bridge = bridgeRef.current;
      if (!bridge?.brandKitSetActive) return;
      try {
        await bridge.brandKitSetActive(id);
        setActiveBrandId(id);
      } catch (err) {
        setBrandMsg({ kind: 'err', text: String((err as Error)?.message || err) });
      }
    },
    [],
  );

  const handlePickLogo = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.brandKitPickLogo || !draft) return;
    setLogoBusy(true);
    setBrandMsg(null);
    try {
      const res = await bridge.brandKitPickLogo();
      if (res?.ok && res.path) {
        patchDraft({ logo: { ...draft.logo, path: res.path } });
      } else if (!res?.canceled) {
        setBrandMsg({ kind: 'err', text: res?.message || tr('brandKit.logoFailed', 'Could not import that image.') });
      }
    } catch (err) {
      setBrandMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    } finally {
      setLogoBusy(false);
    }
  }, [draft, patchDraft, tr]);

  /* ----------------------------- 工程文件操作 ----------------------------- */

  const handleCreateProject = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.projectCreate) return;
    setProjectBusy(true);
    setProjectMsg(null);
    try {
      const res = await bridge.projectCreate({ name: tr('projectFile.newName', 'Untitled project') });
      if (!res?.ok || !res.project) throw new Error('create_failed');
      await refreshProjects();
      await selectProject(res.project.id);
    } catch (err) {
      setProjectMsg({ kind: 'err', text: String((err as Error)?.message || tr('projectFile.createFailed', 'Could not create the project.')) });
    } finally {
      setProjectBusy(false);
    }
  }, [refreshProjects, selectProject, tr]);

  const handleSaveProject = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.projectSave || !activeProject) return;
    const name = projectName.trim();
    if (!name) {
      setProjectMsg({ kind: 'err', text: tr('projectFile.errName', 'Project name is required.') });
      return;
    }
    setProjectBusy(true);
    setProjectMsg(null);
    try {
      const res = await bridge.projectSave({ project: { ...activeProject, name } });
      if (!res?.ok || !res.project) throw new Error('save_failed');
      setActiveProject(res.project);
      setProjectName(res.project.name);
      await refreshProjects();
      setProjectMsg({ kind: 'ok', text: tr('projectFile.saved', 'Project saved.') });
    } catch (err) {
      setProjectMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    } finally {
      setProjectBusy(false);
    }
  }, [activeProject, projectName, refreshProjects, tr]);

  const handleImportProject = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.projectImport) return;
    setProjectBusy(true);
    setProjectMsg(null);
    try {
      const res = await bridge.projectImport();
      if (res?.canceled) return;
      if (!res?.ok || !res.project) {
        setProjectMsg({ kind: 'err', text: res?.message || tr('projectFile.importFailed', 'Could not import that project.') });
        return;
      }
      await refreshProjects();
      await selectProject(res.project.id);
      setProjectMsg({ kind: 'ok', text: tr('projectFile.imported', 'Project imported.') });
    } catch (err) {
      setProjectMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    } finally {
      setProjectBusy(false);
    }
  }, [refreshProjects, selectProject, tr]);

  const handleExportProject = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.projectExport || !activeProject) return;
    setProjectBusy(true);
    setProjectMsg(null);
    try {
      const res = await bridge.projectExport(activeProject.id);
      if (res?.canceled) return;
      if (!res?.ok || !res.path) {
        setProjectMsg({ kind: 'err', text: res?.message || tr('projectFile.exportFailed', 'Export failed.') });
        return;
      }
      setProjectMsg({ kind: 'ok', text: `${tr('projectFile.exported', 'Exported to')} ${res.path}` });
    } catch (err) {
      setProjectMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    } finally {
      setProjectBusy(false);
    }
  }, [activeProject, tr]);

  const handleRelinkMaterial = useCallback(
    async (materialId: string) => {
      const bridge = bridgeRef.current;
      if (!bridge?.projectRelink || !activeProject) return;
      setProjectBusy(true);
      setProjectMsg(null);
      try {
        const res = await bridge.projectRelink({ id: activeProject.id, materialId });
        if (res?.canceled) return;
        if (!res?.ok || !res.project) {
          setProjectMsg({ kind: 'err', text: res?.message || tr('projectFile.relinkFailed', 'Could not relink that file.') });
          return;
        }
        setActiveProject(res.project);
        setMissingIds((res.missing || []).map((m) => m.id));
        await refreshProjects();
      } catch (err) {
        setProjectMsg({ kind: 'err', text: String((err as Error)?.message || err) });
      } finally {
        setProjectBusy(false);
      }
    },
    [activeProject, refreshProjects, tr],
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      const bridge = bridgeRef.current;
      if (!bridge?.projectRemove) return;
      if (!window.confirm(tr('projectFile.confirmDelete', 'Delete this project? The .clipop file is removed; your source footage is kept.'))) return;
      setProjectBusy(true);
      setProjectMsg(null);
      try {
        await bridge.projectRemove(id);
        setActiveProject(null);
        setProjectName('');
        setMissingIds([]);
        await refreshProjects();
      } catch (err) {
        setProjectMsg({ kind: 'err', text: String((err as Error)?.message || tr('projectFile.deleteFailed', 'Could not delete the project.')) });
      } finally {
        setProjectBusy(false);
      }
    },
    [refreshProjects, tr],
  );

  /* ---------- P0-4 首片 Aha 引擎 ---------- */

  const pickAhaVideo = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.ahaPickVideo) return;
    setAhaMsg(null);
    try {
      const res = await bridge.ahaPickVideo();
      if (res?.canceled) return;
      if (res?.ok && res.path) {
        setAhaSource({
          path: res.path,
          name: res.name || '',
          duration: Number(res.duration) || 0,
          bytes: Number(res.bytes) || 0,
        });
        setAhaResult(null);
      } else {
        setAhaMsg({ kind: 'err', text: tr('ahaEngine.errPick', 'Could not read that video.') });
      }
    } catch (err) {
      setAhaMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    }
  }, [tr]);

  const runAha = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge?.ahaFirstClip || !ahaSource || ahaRunning) return;
    setAhaRunning(true);
    setAhaElapsed(0);
    setAhaResult(null);
    setAhaMsg(null);
    try {
      const res = await bridge.ahaFirstClip({
        inputPath: ahaSource.path,
        locale,
        quality: ahaQuality,
        aspect: '9:16',
        plan: 'starter',
      });
      setAhaResult(res);
      if (!res?.ok) {
        setAhaMsg({ kind: 'err', text: res?.message || tr('ahaEngine.errRun', 'Could not make the first clip.') });
      }
    } catch (err) {
      setAhaMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    } finally {
      setAhaRunning(false);
    }
  }, [ahaSource, ahaQuality, ahaRunning, locale, tr]);

  const exportAha = useCallback(async () => {
    const bridge = bridgeRef.current;
    const out = ahaResult?.render?.outputPath;
    if (!bridge?.ahaExport || !out) return;
    setAhaMsg(null);
    try {
      const res = await bridge.ahaExport({ outputPath: out, suggestedName: ahaResult?.render?.outputName });
      if (res?.canceled) return;
      if (res?.ok && res.path) {
        setAhaMsg({ kind: 'ok', text: `${tr('ahaEngine.exported', 'Exported to')} ${res.path}` });
      } else {
        setAhaMsg({ kind: 'err', text: res?.message || tr('ahaEngine.exportFailed', 'Export failed.') });
      }
    } catch (err) {
      setAhaMsg({ kind: 'err', text: String((err as Error)?.message || err) });
    }
  }, [ahaResult, tr]);

  /* 出片过程中的秒表：给「5 分钟」一个可见的进度锚点 */
  useEffect(() => {
    if (!ahaRunning) return;
    const id = window.setInterval(() => setAhaElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [ahaRunning]);

  const engine = status?.engine;
  const ready = Boolean(engine?.available);

  const activeProgress = useMemo(() => {
    if (!downloadingId) return null;
    return progressById[downloadingId] || null;
  }, [downloadingId, progressById]);

  const pct = Math.round(Math.max(0, Math.min(1, activeProgress?.pct ?? 0)) * 100);

  /* 浏览器（非桌面端）：本地引擎不可用，引导去下载客户端 */
  if (bridgeReady === false) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Cpu className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold text-foreground">
              {tr('localEngine.title', 'Local AI Engine')}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {tr(
                'localEngine.desktopOnly',
                'The local AI engine runs on your own Mac. Open this page inside the Clipop desktop app to download models and transcribe offline.',
              )}
            </p>
            <Link
              href="/download"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <HardDriveDownload className="h-4 w-4" />
              {tr('localEngine.getDesktop', 'Get the desktop app')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-10">
        {/* 标题 */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Cpu className="h-6 w-6 text-primary" />
              {tr('localEngine.title', 'Local AI Engine')}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {tr(
                'localEngine.subtitle',
                'Speech recognition and highlight detection run entirely on this Mac. Models download once, then everything works offline with no cloud cost.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {tr('localEngine.refresh', 'Refresh')}
          </button>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* P0-4 首片 Aha 引擎：上传 1 条视频 → 5 分钟拿到可直接发布的竖屏成片 */}
        <section className="mt-6 rounded-xl border border-primary/30 bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {tr('ahaEngine.title', 'First clip in 5 minutes')}
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {tr('ahaEngine.localOnly', 'On-device · no upload')}
              </span>
            </div>
            <span className="rounded border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {tr('ahaEngine.verticalBadge', '9:16 vertical')}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {tr(
              'ahaEngine.hint',
              'Pick one video and get a publish-ready vertical short: auto highlight, subtitles and your brand kit — no settings to learn.',
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void pickAhaVideo()}
              disabled={ahaRunning}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              <FileVideo className="h-3.5 w-3.5" />
              {ahaSource
                ? tr('ahaEngine.change', 'Choose another')
                : tr('ahaEngine.pick', 'Choose a video')}
            </button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {tr('ahaEngine.qualityLabel', 'Speed / accuracy')}
              <select
                value={ahaQuality}
                onChange={(e) => setAhaQuality(e.target.value)}
                disabled={ahaRunning}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50"
              >
                <option value="fast">{tr('ahaEngine.qualityFast', 'Fastest (tiny model)')}</option>
                <option value="balanced">{tr('ahaEngine.qualityBalanced', 'Balanced (base model)')}</option>
                <option value="best">{tr('ahaEngine.qualityBest', 'Most accurate (small model)')}</option>
              </select>
            </label>
          </div>

          {ahaSource ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground">
              <FileVideo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{ahaSource.name}</span>
              {ahaSource.duration > 0 && (
                <span className="text-muted-foreground">· {fmtDuration(ahaSource.duration)}</span>
              )}
              {ahaSource.bytes > 0 && (
                <span className="text-muted-foreground">· {fmtBytes(ahaSource.bytes)}</span>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {tr('ahaEngine.noFile', 'No video selected yet.')}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void runAha()}
              disabled={!ahaSource || ahaRunning}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {ahaRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {ahaRunning
                ? tr('ahaEngine.running', 'Making your first clip…')
                : tr('ahaEngine.run', 'Make my first clip')}
            </button>
            {ahaRunning && (
              <span className="text-xs text-muted-foreground">
                {tr('ahaEngine.elapsed', 'Elapsed')} · {ahaElapsed}s
              </span>
            )}
          </div>

          {ahaMsg && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs ${
                ahaMsg.kind === 'ok'
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-destructive/40 bg-destructive/10 text-destructive'
              }`}
            >
              {ahaMsg.kind === 'ok' ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span className="break-all">{ahaMsg.text}</span>
            </div>
          )}

          {ahaResult?.ok && ahaResult.render && (
            <div className="mt-5 rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                {tr('ahaEngine.resultTitle', 'Your first clip is ready')}
              </div>
              {ahaResult.videoUrl && (
                <video
                  src={ahaResult.videoUrl}
                  controls
                  playsInline
                  className="mt-3 w-full max-w-xs rounded-md bg-black"
                />
              )}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">{tr('ahaEngine.clipLabel', 'Highlight')}</dt>
                <dd className="text-foreground">
                  {fmtDuration(ahaResult.render.duration)} · {ahaResult.render.width}×
                  {ahaResult.render.height}
                </dd>
                <dt className="text-muted-foreground">{tr('ahaEngine.cuesLabel', 'Subtitle lines')}</dt>
                <dd className="text-foreground">{ahaResult.spec?.subtitleCueCount ?? 0}</dd>
                <dt className="text-muted-foreground">{tr('ahaEngine.wordsLabel', 'Word timings')}</dt>
                <dd className="text-foreground">{ahaResult.spec?.subtitleWordCount ?? 0}</dd>
                <dt className="text-muted-foreground">{tr('ahaEngine.cutLabel', 'Silence trimmed')}</dt>
                <dd className="text-foreground">
                  {ahaResult.render.jumpCut?.disabled
                    ? '—'
                    : `${Math.round(ahaResult.render.jumpCut?.removedSec || 0)}s`}
                </dd>
                <dt className="text-muted-foreground">{tr('ahaEngine.budgetLabel', 'Time used')}</dt>
                <dd className="text-foreground">
                  {ahaResult.timings ? `${ahaResult.timings.totalSec}s` : '—'}{' '}
                  <span className="text-muted-foreground">
                    ·{' '}
                    {ahaResult.timings?.withinBudget
                      ? tr('ahaEngine.withinBudget', 'within the 5-minute budget')
                      : tr('ahaEngine.overBudget', 'over the 5-minute budget')}
                  </span>
                </dd>
              </dl>
              {ahaResult.spec?.noTranscript && (
                <p className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    {tr(
                      'ahaEngine.noTranscript',
                      'No speech model was available, so the opening section was exported without subtitles. Download a model and try again for captions.',
                    )}
                  </span>
                </p>
              )}
              <button
                type="button"
                onClick={() => void exportAha()}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Download className="h-3.5 w-3.5" />
                {tr('ahaEngine.export', 'Export video')}
              </button>
            </div>
          )}
        </section>

        {/* 引擎状态 */}
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {tr('localEngine.engineTitle', 'Engine Status')}
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  ready ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {ready
                  ? tr('localEngine.stReady', 'Ready')
                  : tr('localEngine.stNotReady', 'Not ready')}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              whisper.cpp · {tr('localEngine.onDevice', '100% on-device')}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="text-muted-foreground">{tr('localEngine.fEngine', 'ASR engine')}</dt>
              <dd className="mt-0.5 font-mono text-foreground">{engine?.engine || '—'}</dd>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="text-muted-foreground">{tr('localEngine.fModel', 'Active model')}</dt>
              <dd className="mt-0.5 font-mono text-foreground">{engine?.modelId || '—'}</dd>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 sm:col-span-2">
              <dt className="text-muted-foreground">{tr('localEngine.fBinary', 'Engine binary')}</dt>
              <dd className="mt-0.5 break-all font-mono text-foreground">
                {engine?.binary || tr('localEngine.notDetected', 'Not detected')}
              </dd>
            </div>
          </dl>

          {!engine?.binary && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {tr(
                'localEngine.binaryMissing',
                'The bundled engine binary was not found. Reinstall the latest desktop app to restore it.',
              )}
            </p>
          )}
        </section>

        {/* 模型列表 */}
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Download className="h-4 w-4 text-primary" />
              {tr('localEngine.modelsTitle', 'Speech Models')}
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {status ? `${status.readyCount}/${status.models.length}` : '—'}
              </span>
            </div>
            {status && status.readyCount === 0 && (
              <button
                type="button"
                onClick={() => void handleDownload([status.defaultModelId], status.defaultModelId)}
                disabled={Boolean(downloadingId)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {downloadingId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {tr('localEngine.downloadRecommended', 'Download recommended model')}
              </button>
            )}
          </div>

          {/* 下载进度 */}
          {activeProgress && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {activeProgress.file || ''} · {pct}%
                {activeProgress.total
                  ? ` · ${fmtBytes(activeProgress.received || 0)} / ${fmtBytes(activeProgress.total)}`
                  : ''}
              </p>
            </div>
          )}

          {/* 模型行 */}
          <ul className="mt-4 space-y-2">
            {(status?.models || []).map((m) => {
              const isDownloading = downloadingId === m.id;
              const isDefault = status?.defaultModelId === m.id;
              const label = tr(MODEL_LABEL_KEY[m.id] || '', '') || m.label;
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
                      <span className="font-mono">{m.id}</span>
                      {isDefault && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {tr('localEngine.recommended', 'Recommended')}
                        </span>
                      )}
                      {m.ready && (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          <CheckCircle2 className="h-3 w-3" />
                          {tr('localEngine.installed', 'Installed')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {m.ready ? fmtBytes(m.bytes) : `~${fmtBytes(m.minBytes)}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleDownload([m.id], m.id)}
                    disabled={Boolean(downloadingId) || m.ready}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                      m.ready
                        ? 'border border-border bg-background text-muted-foreground'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : m.ready ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {isDownloading
                      ? tr('localEngine.downloading', 'Downloading…')
                      : m.ready
                        ? tr('localEngine.installed', 'Installed')
                        : tr('localEngine.download', 'Download')}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-[11px] text-muted-foreground">
            {tr(
              'localEngine.modelsHint',
              'Models come from Hugging Face and are verified after download. Once installed, transcription and highlight detection never upload your video.',
            )}
          </p>
          {status?.modelsDir && (
            <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
              {status.modelsDir}
            </p>
          )}
        </section>

        {/* P0-1 品牌套件（桌面专用 · 本地零上传） */}
        {brandReady && (
          <section className="mt-6 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Palette className="h-4 w-4 text-primary" />
                {tr('brandKit.title', 'Brand Kit')}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {tr('brandKit.localOnly', 'On-device · no upload')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBrandMsg(null);
                  setDraft(newBrandDraft());
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
                {tr('brandKit.new', 'New brand')}
              </button>
            </div>
            <p className="mt-1 max-w-2xl text-[11px] text-muted-foreground">
              {tr(
                'brandKit.hint',
                'Set fonts, colors, the intro hook, the end CTA and a start logo. Every export automatically uses the active brand. Files stay on this Mac.',
              )}
            </p>

            {brandMsg && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                  brandMsg.kind === 'ok'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-destructive/40 bg-destructive/10 text-destructive'
                }`}
              >
                {brandMsg.kind === 'ok' ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <span className="break-all">{brandMsg.text}</span>
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-[210px_1fr]">
              {/* 品牌列表 */}
              <ul className="space-y-2">
                {brands.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setBrandMsg(null);
                        setDraft(b);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                        draft?.id === b.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-background hover:bg-accent'
                      }`}
                    >
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {b.name || tr('brandKit.untitled', 'Untitled')}
                      </span>
                      {activeBrandId === b.id && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          <Star className="h-3 w-3" />
                          {tr('brandKit.active', 'Active')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              {/* 编辑区 */}
              {draft ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {tr('brandKit.name', 'Brand name')}
                      </span>
                      <input
                        value={draft.name}
                        onChange={(e) => patchDraft({ name: e.target.value })}
                        placeholder={tr('brandKit.namePlaceholder', 'e.g. My Channel')}
                        maxLength={40}
                        className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {tr('brandKit.font', 'Font (system)')}
                      </span>
                      <select
                        value={draft.font}
                        onChange={(e) => patchDraft({ font: e.target.value })}
                        className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                      >
                        {(fonts.length ? fonts : [draft.font]).map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* 主色 */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {tr('brandKit.primaryColor', 'Primary color')}
                    </span>
                    <input
                      type="color"
                      value={draft.primaryColor || '#22c55e'}
                      onChange={(e) => patchDraft({ primaryColor: e.target.value })}
                      className="h-7 w-12 cursor-pointer rounded border border-border bg-background"
                    />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {draft.primaryColor || tr('brandKit.colorDefault', 'default')}
                    </span>
                    {draft.primaryColor && (
                      <button
                        type="button"
                        onClick={() => patchDraft({ primaryColor: '' })}
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        {tr('brandKit.reset', 'Reset')}
                      </button>
                    )}
                  </div>

                  {/* 字幕 */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-[11px] font-semibold text-foreground">
                      {tr('brandKit.subtitleTitle', 'Subtitles')}
                    </p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-4">
                      <label className="block">
                        <span className="text-[10px] text-muted-foreground">
                          {tr('brandKit.subSize', 'Size')}
                        </span>
                        <select
                          value={draft.subtitle.size}
                          onChange={(e) =>
                            patchDraft({
                              subtitle: { ...draft.subtitle, size: e.target.value as BrandSubtitle['size'] },
                            })
                          }
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                        >
                          <option value="small">{tr('brandKit.sizeSmall', 'Small')}</option>
                          <option value="medium">{tr('brandKit.sizeMedium', 'Medium')}</option>
                          <option value="large">{tr('brandKit.sizeLarge', 'Large')}</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-muted-foreground">
                          {tr('brandKit.subOutline', 'Outline')}
                        </span>
                        <select
                          value={draft.subtitle.outline}
                          onChange={(e) =>
                            patchDraft({
                              subtitle: { ...draft.subtitle, outline: e.target.value as BrandSubtitle['outline'] },
                            })
                          }
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                        >
                          <option value="none">{tr('brandKit.outlineNone', 'None')}</option>
                          <option value="light">{tr('brandKit.outlineLight', 'Light')}</option>
                          <option value="bold">{tr('brandKit.outlineBold', 'Bold')}</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-muted-foreground">
                          {tr('brandKit.subBackground', 'Background')}
                        </span>
                        <select
                          value={draft.subtitle.background}
                          onChange={(e) =>
                            patchDraft({
                              subtitle: {
                                ...draft.subtitle,
                                background: e.target.value as BrandSubtitle['background'],
                              },
                            })
                          }
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                        >
                          <option value="none">{tr('brandKit.bgNone', 'None')}</option>
                          <option value="bar">{tr('brandKit.bgBar', 'Bar')}</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-muted-foreground">
                          {tr('brandKit.subHighlight', 'Highlight')}
                        </span>
                        <select
                          value={draft.subtitle.highlight}
                          onChange={(e) =>
                            patchDraft({
                              subtitle: {
                                ...draft.subtitle,
                                highlight: e.target.value as BrandSubtitle['highlight'],
                              },
                            })
                          }
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                        >
                          <option value="yellow">{tr('brandKit.hlYellow', 'Yellow')}</option>
                          <option value="cyan">{tr('brandKit.hlCyan', 'Cyan')}</option>
                          <option value="pink">{tr('brandKit.hlPink', 'Pink')}</option>
                          <option value="green">{tr('brandKit.hlGreen', 'Green')}</option>
                          <option value="orange">{tr('brandKit.hlOrange', 'Orange')}</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  {/* 片头 */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                      <input
                        type="checkbox"
                        checked={draft.intro.enabled}
                        onChange={(e) => patchDraft({ intro: { ...draft.intro, enabled: e.target.checked } })}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      {tr('brandKit.introTitle', 'Intro hook')}
                    </label>
                    <input
                      value={draft.intro.text}
                      onChange={(e) => patchDraft({ intro: { ...draft.intro, text: e.target.value } })}
                      placeholder={tr('brandKit.introPlaceholder', 'Opening hook shown at the start')}
                      maxLength={60}
                      className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                    />
                    <label className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {tr('brandKit.introSeconds', 'Seconds')}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={draft.intro.seconds}
                        onChange={(e) =>
                          patchDraft({ intro: { ...draft.intro, seconds: Number(e.target.value) || 1 } })
                        }
                        className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                      />
                    </label>
                  </div>

                  {/* 片尾 CTA */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                      <input
                        type="checkbox"
                        checked={draft.outro.enabled}
                        onChange={(e) => patchDraft({ outro: { ...draft.outro, enabled: e.target.checked } })}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      {tr('brandKit.outroTitle', 'End CTA')}
                    </label>
                    <input
                      value={draft.outro.text}
                      onChange={(e) => patchDraft({ outro: { ...draft.outro, text: e.target.value } })}
                      placeholder={tr('brandKit.outroPlaceholder', 'Follow for more')}
                      maxLength={60}
                      className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                    />
                  </div>

                  {/* 片头 Logo */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-foreground">
                        {tr('brandKit.logoTitle', 'Start logo')}
                      </p>
                      <div className="flex items-center gap-2">
                        {draft.logo.path && (
                          <button
                            type="button"
                            onClick={() => patchDraft({ logo: { ...draft.logo, path: '' } })}
                            className="text-[11px] font-medium text-muted-foreground hover:text-destructive"
                          >
                            {tr('brandKit.logoRemove', 'Remove')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handlePickLogo()}
                          disabled={logoBusy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
                        >
                          {logoBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ImageIcon className="h-3 w-3" />
                          )}
                          {draft.logo.path
                            ? tr('brandKit.logoReplace', 'Replace')
                            : tr('brandKit.logoPick', 'Choose image')}
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <ImageIcon className="h-3 w-3 shrink-0" />
                      <span className="min-w-0 truncate font-mono">
                        {draft.logo.path
                          ? logoBasename(draft.logo.path)
                          : tr('brandKit.logoNone', 'No logo (PNG / JPG / WEBP)')}
                      </span>
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="text-[10px] text-muted-foreground">
                          {tr('brandKit.logoPosition', 'Position')}
                        </span>
                        <select
                          value={draft.logo.position}
                          onChange={(e) =>
                            patchDraft({
                              logo: { ...draft.logo, position: e.target.value as BrandLogo['position'] },
                            })
                          }
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                        >
                          <option value="br">{tr('brandKit.posBr', 'Bottom right')}</option>
                          <option value="bl">{tr('brandKit.posBl', 'Bottom left')}</option>
                          <option value="tr">{tr('brandKit.posTr', 'Top right')}</option>
                          <option value="tl">{tr('brandKit.posTl', 'Top left')}</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-muted-foreground">
                          {tr('brandKit.logoWidth', 'Width')} · {draft.logo.widthPct}%
                        </span>
                        <input
                          type="range"
                          min={4}
                          max={40}
                          value={draft.logo.widthPct}
                          onChange={(e) =>
                            patchDraft({ logo: { ...draft.logo, widthPct: Number(e.target.value) } })
                          }
                          className="mt-2 w-full accent-primary"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-muted-foreground">
                          {tr('brandKit.logoOpacity', 'Opacity')} ·{' '}
                          {Math.round(draft.logo.opacity * 100)}%
                        </span>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={Math.round(draft.logo.opacity * 100)}
                          onChange={(e) =>
                            patchDraft({ logo: { ...draft.logo, opacity: Number(e.target.value) / 100 } })
                          }
                          className="mt-2 w-full accent-primary"
                        />
                      </label>
                    </div>
                  </div>

                  {/* 操作 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveBrand()}
                      disabled={brandBusy}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {brandBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {tr('brandKit.save', 'Save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSetActiveBrand(draft.id)}
                      disabled={activeBrandId === draft.id || brandBusy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                    >
                      <Star className="h-3.5 w-3.5" />
                      {activeBrandId === draft.id
                        ? tr('brandKit.isActive', 'Active brand')
                        : tr('brandKit.makeActive', 'Set as active')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBrand(draft.id)}
                      disabled={brandBusy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {tr('brandKit.delete', 'Delete')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {tr('brandKit.pickOrNew', 'Select a brand on the left, or create a new one.')}
                </p>
              )}
            </div>
          </section>
        )}

        {/* P0-2 本地工程文件（桌面专用 · 本地零上传） */}
        {projectReady && (
          <section className="mt-6 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FolderOpen className="h-4 w-4 text-primary" />
                {tr('projectFile.title', 'Projects')}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {tr('projectFile.localOnly', 'On-device · no upload')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateProject()}
                  disabled={projectBusy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {projectBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {tr('projectFile.new', 'New project')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleImportProject()}
                  disabled={projectBusy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {tr('projectFile.import', 'Import')}
                </button>
              </div>
            </div>
            <p className="mt-1 max-w-2xl text-[11px] text-muted-foreground">
              {tr(
                'projectFile.hint',
                'Each project is a single .clipop file that points to your footage by path — nothing is copied or uploaded. Reopen it to continue, or export it to move machines.',
              )}
            </p>
            {projectDir && (
              <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{projectDir}</p>
            )}

            {projectMsg && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                  projectMsg.kind === 'ok'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-destructive/40 bg-destructive/10 text-destructive'
                }`}
              >
                {projectMsg.kind === 'ok' ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <span className="break-all">{projectMsg.text}</span>
              </div>
            )}

            {projects.length === 0 && !activeProject ? (
              <p className="mt-4 text-xs text-muted-foreground">
                {tr('projectFile.empty', 'No projects yet.')}{' '}
                {tr('projectFile.emptyHint', 'Create a project or import an existing .clipop file.')}
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-[210px_1fr]">
                {/* 工程列表 */}
                <ul className="space-y-2">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void selectProject(p.id)}
                        className={`flex w-full flex-col gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                          activeProject?.id === p.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background hover:bg-accent'
                        }`}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-medium text-foreground">
                            {p.name || tr('projectFile.empty', 'Untitled')}
                          </span>
                          {p.missingCount > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              {p.missingCount}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {p.materialCount} {tr('projectFile.footage', 'Footage')} · {p.clipCount}{' '}
                          {tr('projectFile.clips', 'Clips')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                {/* 工程详情 */}
                {activeProject ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="block min-w-[180px] flex-1">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {tr('projectFile.name', 'Project name')}
                        </span>
                        <input
                          value={projectName}
                          onChange={(e) => setProjectName(e.target.value)}
                          placeholder={tr('projectFile.namePlaceholder', 'e.g. My first short')}
                          maxLength={80}
                          className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleSaveProject()}
                        disabled={projectBusy}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {projectBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {tr('projectFile.save', 'Save')}
                      </button>
                    </div>

                    <p className="break-all font-mono text-[10px] text-muted-foreground">
                      {tr('projectFile.file', 'Project file')}: {activeProject.id}.clipop
                      {activeProject.brandId ? ` · ${tr('projectFile.brand', 'Brand kit')}: ${activeProject.brandId}` : ''}
                    </p>

                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                          <FileVideo className="h-3.5 w-3.5" />
                          {tr('projectFile.footage', 'Footage')} · {activeProject.materials.length}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          {tr('projectFile.clips', 'Clips')} · {activeProject.clips.length}
                        </span>
                      </div>
                      {activeProject.materials.length === 0 ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {tr('projectFile.noMaterials', 'No source footage in this project yet.')}
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {activeProject.materials.map((m) => {
                            const missing = missingIds.includes(m.id);
                            return (
                              <li
                                key={m.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-medium text-foreground">
                                    {m.fileName || logoBasename(m.filePath)}
                                  </p>
                                  <p className="truncate font-mono text-[10px] text-muted-foreground">{m.filePath}</p>
                                </div>
                                {missing ? (
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                                      <AlertTriangle className="h-3 w-3" />
                                      {tr('projectFile.missingBadge', 'Missing')}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void handleRelinkMaterial(m.id)}
                                      disabled={projectBusy}
                                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
                                    >
                                      <Link2 className="h-3 w-3" />
                                      {tr('projectFile.relink', 'Relink')}
                                    </button>
                                  </div>
                                ) : (
                                  <span className="shrink-0 text-[10px] text-muted-foreground">{fmtBytes(m.sizeBytes)}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {missingIds.length > 0 && (
                        <p className="mt-2 text-[10px] text-destructive">
                          {tr(
                            'projectFile.missingHint',
                            'The source file was moved or deleted — relink it to keep using this project.',
                          )}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleExportProject()}
                        disabled={projectBusy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        {tr('projectFile.export', 'Export')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteProject(activeProject.id)}
                        disabled={projectBusy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {tr('projectFile.delete', 'Delete')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {tr('projectFile.selectOrNew', 'Select a project on the left, or create a new one.')}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* 首启引导 */}
        <section className="mt-6 rounded-xl border border-border bg-muted/30 p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {tr('localEngine.startTitle', 'How it works')}
          </h2>
          <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">1.</span>{' '}
              {tr('localEngine.step1', 'Download one speech model above (Base is recommended, about 142 MB).')}
            </li>
            <li>
              <span className="font-semibold text-foreground">2.</span>{' '}
              {tr('localEngine.step2', 'Open Highlight Clips and pick a local video — transcription starts automatically.')}
            </li>
            <li>
              <span className="font-semibold text-foreground">3.</span>{' '}
              {tr('localEngine.step3', 'Everything runs offline; results are cached on disk so repeat runs are instant.')}
            </li>
          </ol>
          {/* 「下载即用」闭环：模型就绪后直接给一个可点的下一步，避免用户看完说明无处可去 */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/video-clips"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {tr('localEngine.goClips', 'Open Highlight Clips')}
            </Link>
            {(status?.readyCount ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {tr('localEngine.readyHint', 'Model ready — you can start now')}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {tr('localEngine.notReadyHint', 'Download a model first to unlock offline transcription')}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
