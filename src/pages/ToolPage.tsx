import { Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { getToolBySlug, visibleTools } from '@/tools/registry';
import NotFound from './NotFound';

export default function ToolPage() {
  const { slug = '' } = useParams();
  const entry = getToolBySlug(slug);

  if (!entry) return <NotFound />;

  const { meta, Component } = entry;
  const Icon = meta.icon ?? Sparkles;
  const index = visibleTools.findIndex((t) => t.meta.slug === meta.slug);
  const idx = index >= 0 ? String(index + 1).padStart(3, '0') : '—';

  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-20">
      {/* Breadcrumb strip */}
      <nav className="flex items-center justify-between border-b border-ink/30 dark:border-bone/20 py-4 animate-rise">
        <div className="flex items-center gap-3 label">
          <Link to="/" className="text-ink/60 hover:text-vermillion dark:text-bone/50 dark:hover:text-amber">
            ← 目录
          </Link>
          <span className="text-ink/30 dark:text-bone/25">/</span>
          <span className="text-ink/60 dark:text-bone/50">{meta.category || '未分类'}</span>
          <span className="text-ink/30 dark:text-bone/25">/</span>
          <span className="text-ink dark:text-bone">{meta.name}</span>
        </div>
        <span className="num text-[11px] text-ink/50 dark:text-bone/40">
          编号 № {idx}
        </span>
      </nav>

      {/* Spread-style article header */}
      <header className="grid grid-cols-1 gap-8 pt-10 sm:grid-cols-12 sm:items-center sm:gap-6 sm:pt-16">
        <aside className="sm:col-span-3 lg:col-span-2 sm:border-r sm:border-ink/30 sm:dark:border-bone/20 sm:pr-5">
          <div className="relative inline-flex h-14 w-14 items-center justify-center border border-ink dark:border-bone animate-rise">
            <Icon size={22} strokeWidth={1.5} />
            <span aria-hidden className="absolute -right-1 -bottom-1 h-2.5 w-2.5 bg-vermillion dark:bg-amber" />
          </div>

          <dl className="mt-8 space-y-4 text-sm animate-rise delay-2">
            <div>
              <dt className="label text-ink/55 dark:text-bone/45">分类</dt>
              <dd className="mt-1">{meta.category || '未分类'}</dd>
            </div>
            <div>
              <dt className="label text-ink/55 dark:text-bone/45">路径</dt>
              <dd className="num mt-1 text-ink/80 dark:text-bone/70">/{meta.slug}</dd>
            </div>
            {meta.tags && meta.tags.length > 0 && (
              <div>
                <dt className="label text-ink/55 dark:text-bone/45">标签</dt>
                <dd className="num mt-1 text-[13px] text-ink/70 dark:text-bone/60">
                  {meta.tags.map((t) => `#${t}`).join('  ')}
                </dd>
              </div>
            )}
            {meta.author && (
              <div>
                <dt className="label text-ink/55 dark:text-bone/45">作者</dt>
                <dd className="mt-1">{meta.author}</dd>
              </div>
            )}
          </dl>
        </aside>

        <div className="sm:col-span-9 lg:col-span-10">
          <p className="label text-vermillion dark:text-amber animate-rise">
            <span className="num">№ {idx}</span> &nbsp;/&nbsp; {meta.category || '未分类'}
          </p>
          <h1 className="mt-2 font-display text-[clamp(2.5rem,7vw,5.5rem)] font-medium leading-[0.95] tracking-tightest animate-ink-in delay-1 text-balance">
            {meta.name}
          </h1>
        </div>
      </header>

      {/* Rule before workspace */}
      <div className="rule-double mt-12" />

      {/* Workspace — the tool itself */}
      <section className="relative mt-10 animate-rise delay-4">
        <div className="mb-4 flex items-baseline justify-between">
          <p className="label text-ink/60 dark:text-bone/50">§ 工作区</p>
          <p className="num text-[11px] text-ink/40 dark:text-bone/35">图 01</p>
        </div>

        <div className="tick-corner border border-ink/40 dark:border-bone/30 bg-paper dark:bg-graphite-2 p-5 sm:p-8">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16 label text-ink/50 dark:text-bone/40">
                <span className="mr-2 inline-block h-2 w-2 bg-vermillion dark:bg-amber animate-blink" />
                加载中…
              </div>
            }
          >
            <Component />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
