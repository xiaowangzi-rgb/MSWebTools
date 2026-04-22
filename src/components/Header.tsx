import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

function formatIssueDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}·${m}·${day}`;
}

export function Header() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <header className="relative z-30 bg-paper/80 backdrop-blur-[2px] dark:bg-graphite/80">
      {/* Top strip — micro meta */}
      <div className="border-b border-ink/80 dark:border-bone/80">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-1.5 text-[10px] sm:text-[11px]">
          <div className="flex items-center gap-3 label text-ink/70 dark:text-bone/60">
            <span>第 01 卷</span>
            <span className="hidden sm:inline">/</span>
            <span className="hidden sm:inline">第 04 期</span>
            <span className="hidden md:inline">/</span>
            <span className="hidden md:inline">{formatIssueDate()}</span>
          </div>
          <div className="flex items-center gap-3 label text-ink/70 dark:text-bone/60">
            <span className="hidden sm:inline">中文 · 简体</span>
            <span className="hidden sm:inline">/</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-vermillion dark:bg-amber animate-blink" />
              在线
            </span>
          </div>
        </div>
      </div>

      {/* Masthead */}
      <div className="mx-auto flex max-w-[1400px] items-end justify-between gap-6 px-6 py-4 sm:py-6">
        <Link to="/" className="group flex items-end gap-4">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center border border-ink dark:border-bone sm:h-14 sm:w-14">
            <span className="font-display text-xl font-semibold leading-none sm:text-2xl">M</span>
            <span className="absolute -right-px -bottom-px inline-block h-2.5 w-2.5 bg-vermillion dark:bg-amber" />
          </div>
          <div className="flex flex-col">
            <span className="label text-ink/60 dark:text-bone/50">MSWebTools · 第 001 号</span>
            <span className="font-display text-2xl font-medium leading-[0.95] tracking-display sm:text-3xl">
              工具<em className="italic font-light" style={{ fontVariationSettings: "'SOFT' 100, 'opsz' 144" }}>目录</em>
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {!isHome && (
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-2 border border-ink px-3 py-2 label transition hover:bg-ink hover:text-paper dark:border-bone dark:hover:bg-bone dark:hover:text-graphite"
            >
              ← 目录
            </Link>
          )}
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            aria-label="代码仓库"
            className="inline-flex items-center gap-2 border border-ink px-3 py-2 label transition hover:bg-ink hover:text-paper dark:border-bone dark:hover:bg-bone dark:hover:text-graphite"
          >
            仓库
            <span aria-hidden>↗</span>
          </a>
          <ThemeToggle />
        </nav>
      </div>

      {/* Double rule under masthead */}
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="rule-double opacity-90" />
      </div>
    </header>
  );
}
