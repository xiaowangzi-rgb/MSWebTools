import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Plus, ScanSearch, X } from 'lucide-react';
import type { ToolMeta } from '@/tools/types';
import { buildSupportedSet, checkText, type Missing } from './core';
import { blockNameOf } from './blocks';
import { getFileKind, getUnsupportedReason, extractXlsxText } from './xlsx';
import { parseTtfFile } from './parseTtf';

export const meta: ToolMeta = {
  slug: 'font-coverage',
  name: '字体覆盖检测',
  description: '按 TMP FontAsset 真实覆盖检查文本 —— Static 只认 baked 字符，Dynamic 认源 ttf。',
  category: '本地化',
  tags: ['字体', '本地化', '覆盖检测', 'TMP', 'font', 'i18n'],
  icon: ScanSearch,
  accent: 'from-teal-500 to-cyan-500',
};

type FontAssetMode = 'static' | 'dynamic' | 'dynamic-os' | 'ttf' | string;

type FontAssetEntry = {
  name: string;
  file: string;
  mode: FontAssetMode;
  sourceTtf: string | null;
  codepoints: number;
  ranges: [number, number][];
  /** Only set for Dynamic assets: number of cmap entries whose glyph was empty. */
  placeholdersFiltered?: number;
};

type TtfSource = {
  name: string;
  file: string;
  codepoints: number;
  ranges: [number, number][];
  placeholdersFiltered?: number;
};

type Dataset = {
  generatedAt: string;
  project: string;
  scanRoot: string;
  fontAssets: FontAssetEntry[];
  /** Emitted by sync script ≥ v2 — raw TTF cmap coverage (空字形 filtered). */
  sourceTtfs?: TtfSource[];
};

type FileResult = {
  name: string;
  size: number;
  text: string;
  missing: Missing[];
  total: number;
  skipped: number;
  error?: string;
};

const MAX_ROWS = 500;
const PREVIEW_CHARS = 240;

function formatCp(cp: number): string {
  const hex = cp.toString(16).toUpperCase();
  return 'U+' + (hex.length < 4 ? hex.padStart(4, '0') : hex);
}

function modeShort(mode: FontAssetMode): string {
  if (mode === 'static') return 'S';
  if (mode === 'dynamic') return 'D';
  if (mode === 'dynamic-os') return 'DOS';
  if (mode === 'ttf') return 'T';
  return '?';
}

function modeLabel(mode: FontAssetMode): string {
  if (mode === 'static') return 'Static';
  if (mode === 'dynamic') return 'Dynamic';
  if (mode === 'dynamic-os') return 'Dynamic OS';
  if (mode === 'ttf') return 'TTF 源文件';
  return mode;
}

/**
 * 构造"源 TTF"虚拟条目。
 *
 * 优先：同步脚本（v2+）直接 emit 的 `sourceTtfs` —— 扫描 Font 目录下所有 ttf/otf，
 * 不受 Dynamic 引用关系限制（Static-only 使用的 TTF 也会出现）。
 *
 * 回退：旧版本 JSON 只能从 Dynamic FontAsset 的 sourceTtf 字段反推。
 */
function deriveTtfEntries(dataset: Dataset): FontAssetEntry[] {
  if (dataset.sourceTtfs && dataset.sourceTtfs.length > 0) {
    return dataset.sourceTtfs.map((t) => ({
      name: `[TTF] ${t.name}`,
      file: t.file,
      mode: 'ttf' as FontAssetMode,
      sourceTtf: null,
      codepoints: t.codepoints,
      ranges: t.ranges,
      placeholdersFiltered: t.placeholdersFiltered,
    }));
  }
  // Fallback: only Dynamic-referenced TTFs are discoverable
  const byTtf = new Map<string, FontAssetEntry>();
  for (const a of dataset.fontAssets) {
    if (a.mode === 'static') continue;
    if (!a.sourceTtf) continue;
    if (byTtf.has(a.sourceTtf)) continue;
    const base = a.sourceTtf.split('/').pop() || a.sourceTtf;
    byTtf.set(a.sourceTtf, {
      name: `[TTF] ${base}`,
      file: a.sourceTtf,
      mode: 'ttf',
      sourceTtf: null,
      codepoints: a.codepoints,
      ranges: a.ranges,
      placeholdersFiltered: a.placeholdersFiltered,
    });
  }
  return [...byTtf.values()];
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      let t = String(r.result ?? '');
      if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
      resolve(t);
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}

/** 根据扩展名路由：.xlsx 走解压+XML 提取，其余二进制格式直接报错，纯文本按 UTF-8 读。 */
async function readFileContent(file: File): Promise<string> {
  const kind = getFileKind(file.name);
  if (kind === 'unsupported') {
    throw new Error(getUnsupportedReason(file.name));
  }
  if (kind === 'xlsx') {
    return extractXlsxText(file);
  }
  return readFileAsText(file);
}

const USER_TTF_STORAGE_KEY = 'font-coverage:userTtfs/v1';

type UserTtf = {
  name: string;
  codepoints: number;
  ranges: [number, number][];
};

function uniqueUserTtfName(
  fileName: string,
  existing: Set<string>,
  pending: { name: string }[],
): string {
  const base = `[自定义] ${fileName}`;
  const taken = new Set<string>(existing);
  for (const p of pending) taken.add(p.name);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

function loadUserTtfs(): UserTtf[] {
  try {
    const raw = localStorage.getItem(USER_TTF_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t: unknown): t is UserTtf =>
        !!t &&
        typeof (t as UserTtf).name === 'string' &&
        typeof (t as UserTtf).codepoints === 'number' &&
        Array.isArray((t as UserTtf).ranges),
    );
  } catch {
    return [];
  }
}

export default function FontCoverageTool() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [results, setResults] = useState<FileResult[]>([]);
  const [pasted, setPasted] = useState('');
  const [isDragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userTtfs, setUserTtfs] = useState<UserTtf[]>(() => loadUserTtfs());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/font-coverage/supported.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((d: Dataset) => {
        setDataset(d);
        setSelected((prev) => {
          // Preserve any user-TTF selections made before the dataset loaded.
          const next = new Set(prev);
          for (const t of deriveTtfEntries(d)) next.add(t.name);
          return next;
        });
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  // Default-select every user TTF on first appearance so uploads light up immediately.
  useEffect(() => {
    if (userTtfs.length === 0) return;
    setSelected((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const t of userTtfs) {
        if (!next.has(t.name)) {
          next.add(t.name);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [userTtfs]);

  useEffect(() => {
    try {
      localStorage.setItem(USER_TTF_STORAGE_KEY, JSON.stringify(userTtfs));
    } catch {
      // Quota/incognito — silently ignore, uploads remain in-memory for the session.
    }
  }, [userTtfs]);

  const userTtfEntries = useMemo<FontAssetEntry[]>(
    () =>
      userTtfs.map((t) => ({
        name: t.name,
        file: '(上传)',
        mode: 'ttf' as FontAssetMode,
        sourceTtf: null,
        codepoints: t.codepoints,
        ranges: t.ranges,
      })),
    [userTtfs],
  );

  const datasetTtfEntries = useMemo(
    () => (dataset ? deriveTtfEntries(dataset) : []),
    [dataset],
  );

  const ttfEntries = useMemo(
    () => [...datasetTtfEntries, ...userTtfEntries],
    [datasetTtfEntries, userTtfEntries],
  );

  const allAssets = useMemo(
    () => (dataset ? [...dataset.fontAssets, ...ttfEntries] : []),
    [dataset, ttfEntries],
  );

  const supported = useMemo(() => {
    if (!dataset) return null;
    const ranges: [number, number][] = [];
    for (const a of allAssets) {
      if (selected.has(a.name)) {
        for (const r of a.ranges) ranges.push(r);
      }
    }
    return buildSupportedSet(ranges);
  }, [dataset, allAssets, selected]);

  // When the supported set changes (selection toggled, dataset reloaded), re-run
  // the check over any already-collected results so the display stays consistent.
  useEffect(() => {
    if (!supported) return;
    setResults((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((r) => {
        if (r.error || !r.text) return r;
        const { missing, total, skipped } = checkText(r.text, supported, r.name);
        return { ...r, missing, total, skipped };
      });
    });
  }, [supported]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!supported) return;
      const list = Array.from(files);
      const next: FileResult[] = [];
      for (const f of list) {
        try {
          const text = await readFileContent(f);
          const { missing, total, skipped } = checkText(text, supported, f.name);
          next.push({ name: f.name, size: f.size, text, missing, total, skipped });
        } catch (err: unknown) {
          next.push({
            name: f.name,
            size: f.size,
            text: '',
            missing: [],
            total: 0,
            skipped: 0,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      setResults(next);
    },
    [supported],
  );

  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  }
  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter.current += 1;
    setDragging(true);
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragging(false);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function runPasted() {
    if (!supported || !pasted.trim()) return;
    const { missing, total, skipped } = checkText(pasted, supported, '(粘贴文本)');
    setResults([
      {
        name: '(粘贴文本)',
        size: pasted.length,
        text: pasted,
        missing,
        total,
        skipped,
      },
    ]);
  }

  function toggleAsset(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleGroup(names: string[]) {
    if (names.length === 0) return;
    setSelected((prev) => {
      const allIn = names.every((n) => prev.has(n));
      const next = new Set(prev);
      if (allIn) {
        for (const n of names) next.delete(n);
      } else {
        for (const n of names) next.add(n);
      }
      return next;
    });
  }

  const existingTtfNames = useMemo(
    () => new Set(ttfEntries.map((t) => t.name)),
    [ttfEntries],
  );

  const addUserTtfs = useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null);
      const list = Array.from(files);
      const added: UserTtf[] = [];
      const errors: string[] = [];
      for (const f of list) {
        const ext = f.name.toLowerCase().split('.').pop();
        if (ext !== 'ttf' && ext !== 'otf') {
          errors.push(`${f.name}: 只接受 .ttf / .otf`);
          continue;
        }
        try {
          const { codepoints, ranges } = await parseTtfFile(f);
          const uniqueName = uniqueUserTtfName(f.name, existingTtfNames, added);
          added.push({ name: uniqueName, codepoints, ranges });
        } catch (err: unknown) {
          errors.push(
            `${f.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (added.length > 0) {
        setUserTtfs((prev) => [...prev, ...added]);
      }
      if (errors.length > 0) {
        setUploadError(errors.join('\n'));
      }
    },
    [existingTtfNames],
  );

  const removeUserTtf = useCallback((name: string) => {
    setUserTtfs((prev) => prev.filter((t) => t.name !== name));
    setSelected((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  }, []);

  const userTtfNames = useMemo(
    () => new Set(userTtfs.map((t) => t.name)),
    [userTtfs],
  );

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-12 sm:gap-6">
      {/* ─── Reference column ─── */}
      <aside className="sm:col-span-5 lg:col-span-4 sm:border-r sm:border-ink/30 sm:dark:border-bone/20 sm:pr-5">
        <p className="label text-ink/55 dark:text-bone/45">参考数据</p>
        <h2 className="mt-2 font-display text-2xl font-medium leading-tight tracking-display">
          TMP FontAsset
        </h2>
        <p className="mt-2 text-[12.5px] leading-[1.55] text-ink/70 dark:text-bone/60 text-pretty">
          勾选参与覆盖检测的 FontAsset。<span className="num">Static</span> 仅认 baked 字符，<span className="num">Dynamic</span> 认源 ttf 的 cmap。
          改动勾选会立刻对已有结果重算。
        </p>
        <div className="mt-5">
          <AssetPicker
            dataset={dataset}
            ttfEntries={ttfEntries}
            loadError={loadError}
            selected={selected}
            supportedSize={supported?.size ?? 0}
            onToggle={toggleAsset}
            onToggleGroup={toggleGroup}
            userTtfNames={userTtfNames}
            onAddUserTtf={addUserTtfs}
            onRemoveUserTtf={removeUserTtf}
            uploadError={uploadError}
            onDismissUploadError={() => setUploadError(null)}
          />
        </div>
      </aside>

      {/* ─── Workspace column ─── */}
      <div className="sm:col-span-7 lg:col-span-8 space-y-12">
        <section>
          <div className="flex items-baseline justify-between">
            <p className="label text-ink/60 dark:text-bone/50">§ 01 · 输入</p>
            <p className="num text-[11px] text-ink/40 dark:text-bone/35">拖放或粘贴</p>
          </div>

          <div
            onDrop={onDrop}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={[
              'tick-corner relative mt-3 cursor-pointer select-none border px-6 py-12 text-center transition-colors',
              isDragging
                ? 'border-vermillion bg-vermillion/5 dark:border-amber dark:bg-amber/5'
                : 'border-ink/40 hover:border-ink dark:border-bone/30 dark:hover:border-bone',
              !supported && 'pointer-events-none opacity-50',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {isDragging && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 hatch opacity-[0.08]"
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <p className="label text-vermillion dark:text-amber">
              <span className="num">{isDragging ? '松开上传' : '拖放区'}</span>
            </p>
            <p className="mt-3 font-display text-2xl font-medium leading-snug tracking-display sm:text-[28px]">
              拖入一个或多个文本文件，<br />
              <em className="italic font-light" style={{ fontVariationSettings: "'SOFT' 80" }}>
                或点击此处选择。
              </em>
            </p>
            <p className="mt-4 text-[12.5px] text-ink/60 dark:text-bone/50">
              UTF-8（含 BOM） · <span className="num">.xlsx</span> 自动提取 · 控制字符 / emoji 跳过 · 支持多选
            </p>
          </div>

          <details className="mt-6 group border-t border-ink/20 dark:border-bone/15">
            <summary className="label flex cursor-pointer items-center gap-2 py-3 text-ink/65 marker:content-[''] dark:text-bone/55">
              <span className="inline-block w-3 text-vermillion transition-transform group-open:rotate-90 dark:text-amber">
                ›
              </span>
              或直接粘贴一段文本
            </summary>
            <div className="pb-1">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={4}
                placeholder="在此粘贴要检测的文本..."
                className="w-full border border-ink/30 bg-paper/60 p-3 font-mono text-[13px] leading-[1.55] text-ink placeholder:text-ink/40 focus:outline-none dark:border-bone/25 dark:bg-graphite/60 dark:text-bone dark:placeholder:text-bone/30"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={runPasted}
                  disabled={!pasted.trim() || !supported}
                  className="label border border-ink bg-ink px-4 py-2 text-paper transition hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-print-sm disabled:pointer-events-none disabled:opacity-40 dark:border-bone dark:bg-bone dark:text-graphite dark:hover:shadow-print-dark-sm"
                >
                  开始检测 →
                </button>
                <button
                  onClick={() => setPasted('')}
                  disabled={!pasted}
                  className="label border border-ink/40 px-4 py-2 text-ink/70 transition hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-40 dark:border-bone/30 dark:text-bone/60 dark:hover:border-bone dark:hover:text-bone"
                >
                  清空
                </button>
              </div>
            </div>
          </details>
        </section>

        {results.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-3">
                <p className="label text-ink/60 dark:text-bone/50">§ 02 · 检测结果</p>
                <p className="num text-[11px] text-ink/50 dark:text-bone/40">
                  共 {String(results.length).padStart(2, '0')} 条
                </p>
              </div>
              <button
                onClick={() => setResults([])}
                className="label text-ink/55 transition hover:text-vermillion dark:text-bone/40 dark:hover:text-amber"
              >
                清除记录
              </button>
            </div>

            <div className="rule-double mt-3 opacity-60" />

            <div className="mt-8 space-y-10">
              {results.length > 1 && <ResultsSummary results={results} />}
              {results.map((r, i) => (
                <FileResultPanel
                  key={`${r.name}-${i}-${results.length}`}
                  index={results.length - i}
                  result={r}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function AssetPicker({
  dataset,
  ttfEntries,
  loadError,
  selected,
  supportedSize,
  onToggle,
  onToggleGroup,
  userTtfNames,
  onAddUserTtf,
  onRemoveUserTtf,
  uploadError,
  onDismissUploadError,
}: {
  dataset: Dataset | null;
  ttfEntries: FontAssetEntry[];
  loadError: string | null;
  selected: Set<string>;
  supportedSize: number;
  onToggle: (name: string) => void;
  onToggleGroup: (names: string[]) => void;
  userTtfNames: Set<string>;
  onAddUserTtf: (files: FileList | File[]) => void;
  onRemoveUserTtf: (name: string) => void;
  uploadError: string | null;
  onDismissUploadError: () => void;
}) {
  if (loadError) {
    return (
      <div className="border border-vermillion/60 bg-vermillion/5 p-3 text-sm dark:border-amber/60 dark:bg-amber/5">
        <p className="label text-vermillion dark:text-amber">未找到数据</p>
        <p className="mt-2 text-ink/85 dark:text-bone/75">
          在仓库根运行{' '}
          <code className="num bg-ink/5 px-1.5 py-0.5 text-[11.5px] dark:bg-bone/10">
            npm run fonts:sync
          </code>{' '}
          以生成覆盖数据。
        </p>
        <p className="num mt-2 text-[11px] text-ink/50 dark:text-bone/40">{loadError}</p>
      </div>
    );
  }
  if (!dataset) {
    return (
      <div className="label flex items-center gap-2 text-ink/50 dark:text-bone/40">
        <span className="inline-block h-2 w-2 animate-blink bg-vermillion dark:bg-amber" />
        加载中…
      </div>
    );
  }
  const when = new Date(dataset.generatedAt).toLocaleString('zh-CN', { hour12: false });
  const assets = dataset.fontAssets;
  const total = assets.length;
  const ttfTotal = ttfEntries.length;
  const assetSelected = assets.reduce((n, a) => n + (selected.has(a.name) ? 1 : 0), 0);
  const ttfSelected = ttfEntries.reduce((n, t) => n + (selected.has(t.name) ? 1 : 0), 0);
  const totalAll = total + ttfTotal;
  const selectedAll = assetSelected + ttfSelected;

  const staticAssets = assets.filter((a) => a.mode === 'static');
  const dynamicAssets = assets.filter(
    (a) => a.mode === 'dynamic' || a.mode === 'dynamic-os',
  );
  const otherAssets = assets.filter(
    (a) =>
      a.mode !== 'static' && a.mode !== 'dynamic' && a.mode !== 'dynamic-os',
  );
  const countSelected = (list: FontAssetEntry[]) =>
    list.reduce((n, a) => n + (selected.has(a.name) ? 1 : 0), 0);

  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-2.5">
        {ttfTotal > 0 && (
          <StatRow label="已选 TTF" value={`${ttfSelected} / ${ttfTotal}`} strong />
        )}
        <StatRow
          label="已选 FontAsset"
          value={`${assetSelected} / ${total}`}
          strong={ttfTotal === 0}
        />
        <StatRow label="覆盖码点（并集）" value={supportedSize.toLocaleString()} />
        <StatRow label="更新于" value={when} small />
      </dl>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <GroupToggle
          label="全部"
          total={totalAll}
          selectedCount={selectedAll}
          onToggle={() =>
            onToggleGroup([
              ...ttfEntries.map((t) => t.name),
              ...assets.map((a) => a.name),
            ])
          }
        />
        {ttfTotal > 0 && (
          <GroupToggle
            label="TTF"
            total={ttfTotal}
            selectedCount={ttfSelected}
            onToggle={() => onToggleGroup(ttfEntries.map((t) => t.name))}
          />
        )}
        {staticAssets.length > 0 && (
          <GroupToggle
            label="Static"
            total={staticAssets.length}
            selectedCount={countSelected(staticAssets)}
            onToggle={() => onToggleGroup(staticAssets.map((a) => a.name))}
          />
        )}
        {dynamicAssets.length > 0 && (
          <GroupToggle
            label="Dynamic"
            total={dynamicAssets.length}
            selectedCount={countSelected(dynamicAssets)}
            onToggle={() => onToggleGroup(dynamicAssets.map((a) => a.name))}
          />
        )}
      </div>

      {uploadError && (
        <div className="flex items-start gap-2 border border-vermillion/60 bg-vermillion/5 p-2.5 text-[11.5px] dark:border-amber/60 dark:bg-amber/5">
          <p className="flex-1 whitespace-pre-line text-vermillion/90 dark:text-amber/85">
            {uploadError}
          </p>
          <button
            onClick={onDismissUploadError}
            className="label shrink-0 text-vermillion/70 hover:text-vermillion dark:text-amber/70 dark:hover:text-amber"
          >
            ×
          </button>
        </div>
      )}

      <div className="border-t border-ink/15 pt-1 dark:border-bone/10">
        <AssetGroup
          defaultOpen
          label="源 TTF 文件"
          hint="空字形已过滤"
          total={ttfTotal}
          selectedCount={ttfSelected}
          action={<AddTtfButton onPick={onAddUserTtf} />}
        >
          {ttfEntries.length === 0 ? (
            <li className="label px-1 py-2 text-[11px] text-ink/45 dark:text-bone/35">
              还没有 TTF —— 点右上角 + 添加一个本地 ttf/otf。
            </li>
          ) : (
            ttfEntries.map((t) => (
              <AssetRow
                key={t.name}
                asset={t}
                checked={selected.has(t.name)}
                onToggle={() => onToggle(t.name)}
                onRemove={
                  userTtfNames.has(t.name)
                    ? () => onRemoveUserTtf(t.name)
                    : undefined
                }
              />
            ))
          )}
        </AssetGroup>
        {staticAssets.length > 0 && (
          <AssetGroup
            defaultOpen
            label="Static"
            total={staticAssets.length}
            selectedCount={countSelected(staticAssets)}
          >
            {staticAssets.map((a) => (
              <AssetRow
                key={a.name}
                asset={a}
                checked={selected.has(a.name)}
                onToggle={() => onToggle(a.name)}
              />
            ))}
          </AssetGroup>
        )}
        {dynamicAssets.length > 0 && (
          <AssetGroup
            defaultOpen
            label="Dynamic"
            total={dynamicAssets.length}
            selectedCount={countSelected(dynamicAssets)}
          >
            {dynamicAssets.map((a) => (
              <AssetRow
                key={a.name}
                asset={a}
                checked={selected.has(a.name)}
                onToggle={() => onToggle(a.name)}
              />
            ))}
          </AssetGroup>
        )}
        {otherAssets.length > 0 && (
          <AssetGroup
            defaultOpen
            label="其他"
            total={otherAssets.length}
            selectedCount={countSelected(otherAssets)}
          >
            {otherAssets.map((a) => (
              <AssetRow
                key={a.name}
                asset={a}
                checked={selected.has(a.name)}
                onToggle={() => onToggle(a.name)}
              />
            ))}
          </AssetGroup>
        )}
      </div>
    </div>
  );
}

function AssetGroup({
  label,
  hint,
  total,
  selectedCount,
  children,
  defaultOpen,
  action,
}: {
  label: string;
  hint?: string;
  total: number;
  selectedCount: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group border-b border-ink/10 last:border-b-0 dark:border-bone/10"
    >
      <summary className="flex cursor-pointer items-center gap-3 py-2.5 marker:content-['']">
        <span className="inline-block w-3 text-vermillion transition-transform group-open:rotate-90 dark:text-amber">
          ›
        </span>
        <span className="label flex-1 text-ink/70 dark:text-bone/60">{label}</span>
        {hint && (
          <span className="num text-[10.5px] text-ink/40 dark:text-bone/35">
            {hint}
          </span>
        )}
        <span className="num shrink-0 text-[11px] text-ink/55 dark:text-bone/45 tabular-nums">
          {selectedCount} / {total}
        </span>
        {action}
      </summary>
      <ul className="space-y-1.5 pb-3">{children}</ul>
    </details>
  );
}

function AddTtfButton({
  onPick,
}: {
  onPick: (files: FileList | File[]) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button
        type="button"
        title="上传本地 ttf/otf"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ref.current?.click();
        }}
        className="label inline-flex h-5 w-5 shrink-0 items-center justify-center border border-ink/40 text-ink/60 transition hover:border-vermillion hover:text-vermillion dark:border-bone/30 dark:text-bone/50 dark:hover:border-amber dark:hover:text-amber"
      >
        <Plus size={12} strokeWidth={1.75} />
      </button>
      <input
        ref={ref}
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-otf"
        multiple
        className="sr-only"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onPick(e.target.files);
          }
          e.target.value = '';
        }}
      />
    </>
  );
}

function AssetRow({
  asset,
  checked,
  onToggle,
  onRemove,
}: {
  asset: FontAssetEntry;
  checked: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const isDyn = asset.mode === 'dynamic' || asset.mode === 'dynamic-os';
  return (
    <li>
      <label
        className={[
          'flex items-center gap-2.5 border border-ink/15 px-2.5 py-1.5 cursor-pointer transition dark:border-bone/10',
          checked
            ? 'bg-ink/[0.04] dark:bg-bone/[0.04]'
            : 'opacity-60 hover:opacity-100',
        ].join(' ')}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 accent-vermillion dark:accent-amber"
        />
        <ModeBadge mode={asset.mode} />
        <span className="min-w-0 flex-1 truncate text-[12px]" title={asset.name}>
          {asset.name}
        </span>
        <span className="num shrink-0 text-[11px] text-ink/55 dark:text-bone/45">
          {asset.codepoints.toLocaleString()}
        </span>
        {onRemove && (
          <button
            type="button"
            title="移除"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-ink/40 transition hover:text-vermillion dark:text-bone/35 dark:hover:text-amber"
          >
            <X size={11} strokeWidth={2} />
          </button>
        )}
      </label>
      {isDyn && asset.sourceTtf && (
        <p className="mt-0.5 ml-6 num text-[10.5px] text-ink/45 dark:text-bone/35">
          ← {asset.sourceTtf}
          {typeof asset.placeholdersFiltered === 'number' && asset.placeholdersFiltered > 0 && (
            <span className="ml-2 text-vermillion/75 dark:text-amber/75">
              −{asset.placeholdersFiltered.toLocaleString()} 空字形
            </span>
          )}
        </p>
      )}
      {asset.mode === 'ttf' && typeof asset.placeholdersFiltered === 'number' && asset.placeholdersFiltered > 0 && (
        <p className="mt-0.5 ml-6 num text-[10.5px] text-moss/80 dark:text-amber/55">
          −{asset.placeholdersFiltered.toLocaleString()} 空字形已排除
        </p>
      )}
    </li>
  );
}

function ModeBadge({ mode }: { mode: FontAssetMode }) {
  const short = modeShort(mode);
  const style =
    mode === 'ttf'
      ? 'border-moss text-moss dark:border-amber/80 dark:text-amber/80 border-dashed'
      : mode === 'dynamic' || mode === 'dynamic-os'
      ? 'border-vermillion text-vermillion dark:border-amber dark:text-amber'
      : 'border-ink/50 text-ink/60 dark:border-bone/40 dark:text-bone/55';
  return (
    <span
      title={modeLabel(mode)}
      className={[
        'num inline-flex h-4 w-5 items-center justify-center border text-[9.5px] font-medium',
        style,
      ].join(' ')}
    >
      {short}
    </span>
  );
}

function GroupToggle({
  label,
  total,
  selectedCount,
  onToggle,
}: {
  label: string;
  total: number;
  selectedCount: number;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const allOn = total > 0 && selectedCount === total;
  const partial = selectedCount > 0 && selectedCount < total;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);
  return (
    <label className="label inline-flex cursor-pointer select-none items-center gap-2 text-[10.5px] text-ink/70 transition hover:text-ink dark:text-bone/60 dark:hover:text-bone">
      <input
        ref={ref}
        type="checkbox"
        checked={allOn}
        onChange={onToggle}
        className="h-3.5 w-3.5 accent-vermillion dark:accent-amber"
      />
      <span>{label}</span>
      <span className="num tabular-nums text-ink/45 dark:text-bone/35">
        {selectedCount}/{total}
      </span>
    </label>
  );
}

function StatRow({
  label,
  value,
  strong,
  small,
}: {
  label: string;
  value: string;
  strong?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/15 pb-2 dark:border-bone/10">
      <dt className="label text-ink/55 dark:text-bone/45">{label}</dt>
      <dd
        className={[
          'num tabular-nums',
          strong && 'font-display text-lg font-medium',
          small && 'text-[11.5px] text-ink/65 dark:text-bone/55',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

function ResultsSummary({ results }: { results: FileResult[] }) {
  const totalMissing = results.reduce((n, r) => n + r.missing.length, 0);
  const filesWithMissing = results.filter((r) => r.missing.length > 0).length;
  const unique = new Set<number>();
  const counter = new Map<number, { char: string; count: number }>();
  for (const r of results) {
    for (const m of r.missing) {
      unique.add(m.codepoint);
      const prev = counter.get(m.codepoint);
      if (prev) prev.count++;
      else counter.set(m.codepoint, { char: m.char, count: 1 });
    }
  }
  const top = [...counter.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  return (
    <div className="border border-ink/40 bg-paper/50 p-5 dark:border-bone/25 dark:bg-graphite-2/50 sm:p-6">
      <div className="flex items-baseline justify-between">
        <p className="label text-ink/55 dark:text-bone/45">fig. 00 · 汇总</p>
        <p className="num text-[11px] text-ink/40 dark:text-bone/35">统计</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px border border-ink/20 bg-ink/20 dark:border-bone/15 dark:bg-bone/15 sm:grid-cols-4">
        <Stat label="被测项" value={results.length} />
        <Stat label="其中有缺失" value={filesWithMissing} />
        <Stat label="缺失码点（去重）" value={unique.size} />
        <Stat label="缺失出现次数" value={totalMissing} />
      </div>

      {top.length > 0 && (
        <div className="mt-6">
          <p className="label text-ink/55 dark:text-bone/45">高频缺失字符 · 按出现次数</p>
          <div className="mt-2 border border-ink/30 dark:border-bone/20">
            <table className="w-full text-[13px]">
              <thead className="label text-[10.5px] tracking-wider">
                <tr className="border-b border-ink/30 dark:border-bone/20 bg-ink/5 dark:bg-bone/5">
                  <Th className="w-16">次数</Th>
                  <Th className="w-12">字符</Th>
                  <Th className="w-28">码点</Th>
                  <Th>Unicode 区块</Th>
                </tr>
              </thead>
              <tbody>
                {top.map(([cp, v]) => (
                  <tr
                    key={cp}
                    className="border-t border-ink/10 dark:border-bone/10"
                  >
                    <Td className="num text-ink/85 dark:text-bone/75">{v.count}</Td>
                    <Td className="text-xl leading-none">{v.char}</Td>
                    <Td className="num text-ink/75 dark:text-bone/60">{formatCp(cp)}</Td>
                    <Td className="text-ink/80 dark:text-bone/70">{blockNameOf(cp)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-paper px-4 py-3 dark:bg-graphite">
      <p className="label text-ink/55 dark:text-bone/45">{label}</p>
      <p className="mt-1 font-display text-2xl font-medium leading-none tracking-display">
        {value}
      </p>
    </div>
  );
}

function FileResultPanel({
  result,
  index,
}: {
  result: FileResult;
  index: number;
}) {
  if (result.error) {
    return (
      <article className="border border-vermillion/60 bg-vermillion/5 p-4 text-sm dark:border-amber/60 dark:bg-amber/5">
        <p className="label text-vermillion dark:text-amber">读取失败</p>
        <p className="mt-1 font-display text-lg">{result.name}</p>
        <p className="mt-2 num text-[12px] text-ink/70 dark:text-bone/60">{result.error}</p>
      </article>
    );
  }
  const ok = result.missing.length === 0;
  const idx = String(index).padStart(3, '0');
  const checked = Math.max(0, result.total - result.skipped);
  const preview = result.text.slice(0, PREVIEW_CHARS);
  const previewClipped = result.text.length > PREVIEW_CHARS;

  // 按字符去重：一个唯一缺失字符一行，附首次出现位置 + 累计次数。
  const grouped = (() => {
    const map = new Map<
      number,
      { char: string; count: number; firstLine: number; firstCol: number }
    >();
    for (const m of result.missing) {
      const prev = map.get(m.codepoint);
      if (prev) {
        prev.count++;
      } else {
        map.set(m.codepoint, {
          char: m.char,
          count: 1,
          firstLine: m.line,
          firstCol: m.col,
        });
      }
    }
    return [...map.entries()]
      .map(([cp, v]) => ({ cp, ...v }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.firstLine - b.firstLine ||
          a.firstCol - b.firstCol,
      );
  })();
  const uniqueCount = grouped.length;
  const shown = grouped.slice(0, MAX_ROWS);
  const clipped = grouped.length - shown.length;

  return (
    <article className="tick-corner border border-ink/40 bg-paper dark:border-bone/25 dark:bg-graphite">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/20 px-5 py-4 dark:border-bone/15 sm:px-6">
        <div className="flex items-baseline gap-3">
          <span className="num text-[11px] text-ink/50 dark:text-bone/40">№ {idx}</span>
          <h3 className="font-display text-lg font-medium tracking-display">
            {result.name}
          </h3>
        </div>
        <p className="num flex items-center gap-2 text-[11.5px] text-ink/60 dark:text-bone/50">
          {ok ? (
            <span className="label text-moss dark:text-amber">全部覆盖</span>
          ) : (
            <span className="label text-vermillion dark:text-amber">
              缺失 {uniqueCount} 字
            </span>
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ink/15 bg-ink/[0.015] px-5 py-2 text-[11.5px] num text-ink/65 dark:border-bone/10 dark:bg-bone/[0.02] dark:text-bone/55 sm:px-6">
        <span>被测 <b className="text-ink/90 dark:text-bone/85">{checked}</b></span>
        <span className="opacity-50">·</span>
        <span>跳过 <b className="text-ink/90 dark:text-bone/85">{result.skipped}</b> (emoji / 控制字符)</span>
        <span className="opacity-50">·</span>
        <span>
          缺失 <b className="text-ink/90 dark:text-bone/85">{uniqueCount}</b> 个字符
          {result.missing.length > uniqueCount && (
            <>
              <span className="opacity-50"> · </span>
              共 <b className="text-ink/90 dark:text-bone/85">{result.missing.length}</b> 次出现
            </>
          )}
        </span>
      </div>

      {preview && (
        <blockquote className="border-b border-ink/15 bg-paper-2/40 px-5 py-3 text-[12.5px] font-mono leading-[1.55] text-ink/80 dark:border-bone/10 dark:bg-graphite-2/40 dark:text-bone/70 sm:px-6">
          <p className="label mb-1.5 text-ink/45 dark:text-bone/35">Preview</p>
          <p className="whitespace-pre-wrap break-all">
            {preview}
            {previewClipped && <span className="text-ink/40 dark:text-bone/30">…</span>}
          </p>
        </blockquote>
      )}

      {ok ? (
        <p className="px-5 py-8 text-center text-[13px] text-ink/60 dark:text-bone/50 sm:px-6">
          {checked === 0
            ? '没有可检测的字符（全部被跳过或为空）。'
            : '所有被检测字符均在当前勾选的 FontAsset 覆盖范围内。'}
        </p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 label text-[10.5px] tracking-wider">
              <tr className="border-b border-ink/30 dark:border-bone/20 bg-paper-2 dark:bg-graphite-2">
                <Th className="w-12">字符</Th>
                <Th className="w-28">码点</Th>
                <Th className="w-16">次数</Th>
                <Th className="w-28">首次位置</Th>
                <Th>Unicode 区块</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => (
                <tr
                  key={g.cp}
                  className="border-t border-ink/10 dark:border-bone/10 hover:bg-ink/[0.025] dark:hover:bg-bone/[0.03]"
                >
                  <Td className="text-xl leading-none">{g.char}</Td>
                  <Td className="num text-ink/75 dark:text-bone/60">
                    {formatCp(g.cp)}
                  </Td>
                  <Td className="num text-ink/85 dark:text-bone/75">{g.count}</Td>
                  <Td className="num text-[11.5px] text-ink/60 dark:text-bone/50">
                    {g.firstLine}:{g.firstCol}
                  </Td>
                  <Td className="text-ink/80 dark:text-bone/70">
                    {blockNameOf(g.cp)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {clipped > 0 && (
            <p className="border-t border-ink/15 bg-ink/[0.02] px-5 py-2 num text-[11px] text-ink/55 dark:border-bone/10 dark:bg-bone/[0.02] dark:text-bone/45 sm:px-6">
              另有 {clipped} 个字符已折叠（只显示前 {MAX_ROWS} 个）
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={
        'px-3 py-2 text-left font-normal text-ink/55 dark:text-bone/45 sm:px-4 ' +
        className
      }
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={'px-3 py-2 align-middle sm:px-4 ' + className}>{children}</td>;
}
