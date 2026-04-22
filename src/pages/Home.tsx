import { useMemo, useState } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { CategoryChips } from '@/components/CategoryChips';
import { ToolCard } from '@/components/ToolCard';
import { getCategories, visibleTools } from '@/tools/registry';

export default function Home() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => getCategories(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleTools.filter(({ meta }) => {
      if (category && (meta.category || '未分类') !== category) return false;
      if (!q) return true;
      const haystack = [
        meta.name,
        meta.description,
        meta.category ?? '',
        ...(meta.tags ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, category]);

  const totalCount = visibleTools.length;

  return (
    <div className="mx-auto max-w-[1400px] px-6">
      {/* HERO — editorial spread */}
      <section className="relative pt-10 sm:pt-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-12 sm:gap-6">
          {/* Left margin — meta column */}
          <aside className="sm:col-span-3 lg:col-span-2 sm:border-r sm:border-ink/30 sm:dark:border-bone/20 sm:pr-5">
            <p className="label text-ink/55 dark:text-bone/45 animate-rise">栏目</p>
            <p className="mt-1 font-display text-lg leading-tight animate-rise delay-1">
              软件
              <br />
              工具
            </p>
            <div className="mt-6 rule opacity-30 animate-rule-draw delay-2" />
            <dl className="mt-4 space-y-3 text-sm animate-rise delay-3">
              <div>
                <dt className="label text-ink/55 dark:text-bone/45">收录日期</dt>
                <dd className="num mt-0.5 text-ink/80 dark:text-bone/70">
                  {new Intl.DateTimeFormat('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  }).format(new Date())}
                </dd>
              </div>
              <div>
                <dt className="label text-ink/55 dark:text-bone/45">条目数</dt>
                <dd className="num mt-0.5 text-ink/80 dark:text-bone/70">
                  共 {String(totalCount).padStart(3, '0')} 项
                </dd>
              </div>
              <div>
                <dt className="label text-ink/55 dark:text-bone/45">编者</dt>
                <dd className="mt-0.5 text-ink/80 dark:text-bone/70">内部</dd>
              </div>
            </dl>
          </aside>

          {/* Main headline */}
          <div className="sm:col-span-9 lg:col-span-10">
            <p className="label text-vermillion dark:text-amber animate-rise">
              <span className="num">№ 01</span> &nbsp;/&nbsp; 开篇
            </p>
            <h1 className="mt-3 font-display text-[13vw] font-medium leading-[0.9] tracking-tightest sm:text-[96px] lg:text-[128px] animate-ink-in delay-1">
              小工具
              <br />
              <em
                className="italic font-light"
                style={{ fontVariationSettings: "'SOFT' 100, 'opsz' 144, 'wght' 300" }}
              >
                精细活
              </em>
            </h1>

            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-12 sm:gap-8">
              <div className="sm:col-span-7 max-w-2xl animate-rise delay-3 relative border-l-2 border-ink dark:border-bone pl-6">
                <p className="relative font-display text-xl leading-[1.4] text-ink/85 dark:text-bone/80 sm:text-[24px] text-pretty">
                  让每个程序<em className="italic font-light">只做一件事</em>，并把它做好；
                  让它们彼此<em className="italic font-light">协同工作</em>。
                </p>
                <p className="mt-5 label text-ink/60 dark:text-bone/50">
                  <span className="num mr-1">——</span>道格·麦基尔罗伊 · Unix 哲学 · <span className="num">1978</span>
                </p>
              </div>
              <aside className="sm:col-span-4 sm:col-start-9 animate-rise delay-4">
                <div className="border-l-2 border-vermillion dark:border-amber pl-4">
                  <p className="label text-ink/55 dark:text-bone/45">编者按</p>
                  <p className="mt-1 text-sm text-ink/80 dark:text-bone/70 italic font-display" style={{ fontVariationSettings: "'SOFT' 60" }}>
                    "小而锐利的工具，组合胜于集成。一处收录，各自独立，互不耦合。"
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>

      {/* SEARCH & FILTER — set apart with double rule */}
      <section className="mt-20 animate-rise delay-5">
        <div className="rule-double mb-8" />

        <div className="mb-6 flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <p className="label text-ink/60 dark:text-bone/50">§ 目录</p>
            <p className="num text-[11px] text-ink/50 dark:text-bone/40">
              显示 {String(filtered.length).padStart(2, '0')} / {String(totalCount).padStart(2, '0')}
            </p>
          </div>
          <p className="hidden sm:block label text-ink/40 dark:text-bone/35">
            向下滚动 ↓
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <SearchBar value={query} onChange={setQuery} />
          {categories.length > 0 && (
            <CategoryChips
              categories={categories}
              value={category}
              onChange={setCategory}
            />
          )}
        </div>
      </section>

      {/* CATALOG GRID */}
      <section className="mt-12 pb-20">
        {filtered.length === 0 ? (
          <EmptyState hasTools={visibleTools.length > 0} />
        ) : (
          <div className="grid grid-cols-1 gap-px bg-ink/20 dark:bg-bone/15 border border-ink/20 dark:border-bone/15 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(({ meta }, i) => (
              <ToolCard key={meta.slug} meta={meta} index={i} />
            ))}
            {/* Fill cells to complete the grid */}
            {Array.from({
              length:
                (3 - (filtered.length % 3)) % 3 === 0 && filtered.length % 3 !== 0
                  ? 0
                  : (3 - (filtered.length % 3)) % 3,
            }).map((_, i) => (
              <div
                key={`filler-${i}`}
                className="hidden lg:block bg-paper dark:bg-graphite"
                aria-hidden
              >
                <div className="h-full min-h-[220px] bg-grid opacity-40" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState({ hasTools }: { hasTools: boolean }) {
  return (
    <div className="tick-corner relative border border-ink/40 dark:border-bone/30 px-8 py-20 text-center sm:py-28">
      <p className="label text-vermillion dark:text-amber">提示</p>
      <h3 className="mt-4 font-display text-4xl font-medium tracking-display sm:text-5xl">
        {hasTools ? (
          <>
            没有匹配的<em className="italic font-light">条目</em>。
          </>
        ) : (
          <>
            <em className="italic font-light">目录</em>暂为空。
          </>
        )}
      </h3>
      <p className="mx-auto mt-4 max-w-lg text-sm text-ink/70 dark:text-bone/60">
        {hasTools
          ? '试试换个关键字，或清除分类筛选。'
          : '在 src/tools/ 下新建一个文件夹即可自动注册一个工具。详见 README。'}
      </p>
    </div>
  );
}
