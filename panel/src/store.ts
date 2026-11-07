/** 面板的状态与类型：读取 map.generated.json、按路径取文件内容、格式化工具。 */
import { computed, ref } from "vue";

export interface DocEntry {
  path: string;
  name: string;
  title: string;
  purpose: string | null;
  status: string | null;
  hasFrontmatter: boolean;
  lines: number;
  bytes: number;
  hash: string;
  isAdr: boolean;
  isAgentDoc: boolean;
}

export interface TestEntry {
  path: string;
  name: string;
  description: string | null;
  lines: number;
  cases: number;
  asserts: number;
  seam: string | null;
  violations: string[];
}

export interface FileEntry {
  path: string;
  name: string;
  dir: string;
  ext: string;
  size: number;
  lines: number | null;
  binary: boolean;
  isDoc: boolean;
  isTest: boolean;
  module: string | null;
  description: string | null;
}

export interface FileContent {
  path: string;
  text: string;
  truncated: boolean;
  lines: number;
  bytes: number;
}

export interface ModuleEntry {
  path: string;
  layer: string;
  seam: string | null;
  role: string;
  exists: boolean;
  fileCount: number;
  lines: number;
  files: string[];
  testCount: number;
}

export interface IterationFile {
  path: string;
  add: number;
  del: number;
}

export interface Iteration {
  index: number;
  id: string;
  title: string;
  date: string | null;
  commits: number;
  pr: number | null;
  branch: string | null;
  sha: string;
  short?: string;
  body: string;
  files: IterationFile[];
  fileCount?: number;
  additions?: number;
  deletions?: number;
  commitList?: { short: string; subject: string }[];
}

export interface AcceptanceRow {
  id: string;
  area: string | null;
  title: string;
  how: string;
  status: string;
  evidence: string;
}

export interface HealthIssue {
  level: "error" | "warn" | "info";
  kind: string;
  path: string | null;
  message: string;
}

export interface MapData {
  generatedAt: string;
  generator: string;
  project: { name: string; tagline: string; repo: string };
  head: { sha: string; subject: string; date: string; branch: string } | null;
  layers: { id: string; name: string; blurb: string; dirs: string[] }[];
  modules: ModuleEntry[];
  docs: DocEntry[];
  docStats: { count: number; lines: number; withoutFrontmatter: number; adrCount: number };
  tests: TestEntry[];
  testStats: { files: number; cases: number; asserts: number; lines: number; bySeam: Record<string, number>; unseamed: number };
  files: {
    total: number; code: number; docs: number; tests: number; binary: number; lines: number;
    byExt: Record<string, number>; byDir: Record<string, number>; list: FileEntry[];
  };
  iterations: Iteration[];
  iterationNote: string | null;
  acceptance: AcceptanceRow[];
  acceptanceStats: { total: number; done: number; partial: number; blocked: number; todo: number };
  health: { issues: HealthIssue[]; errors: number; warnings: number; ok: boolean };
}

const data = ref<MapData | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

export async function loadMap() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch("/map.generated.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    data.value = await res.json();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

export function useMap() {
  return {
    data,
    error,
    loading,
    reload: loadMap,
    stats: computed(() => data.value),
  };
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const contentCache = new Map<string, FileContent>();

/** 读文件内容。缓存按路径存，同一个文件只请求一次。 */
export async function fetchFile(path: string): Promise<FileContent> {
  const hit = contentCache.get(path);
  if (hit) return hit;
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `读取失败（${res.status}）`);
  }
  const data = (await res.json()) as FileContent;
  contentCache.set(path, data);
  return data;
}
