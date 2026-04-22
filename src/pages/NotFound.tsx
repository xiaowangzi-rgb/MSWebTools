import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[1400px] px-6">
      <div className="grid min-h-[70vh] grid-cols-1 items-center gap-8 sm:grid-cols-12 sm:gap-6">
        <div className="sm:col-span-5 lg:col-span-6">
          <p className="label text-vermillion dark:text-amber animate-rise">
            <span className="num">№ 404</span> &nbsp;/&nbsp; 未登记
          </p>
          <h1 className="mt-3 font-display text-[18vw] font-medium leading-[0.85] tracking-tightest sm:text-[180px] animate-ink-in delay-1">
            未
            <br />
            <em
              className="italic font-light"
              style={{ fontVariationSettings: "'SOFT' 100, 'opsz' 144, 'wght' 300" }}
            >
              收录。
            </em>
          </h1>
        </div>
        <aside className="sm:col-span-5 sm:col-start-8 lg:col-span-4 lg:col-start-9 animate-rise delay-3">
          <div className="rule-double mb-6" />
          <p className="label text-ink/60 dark:text-bone/50">条目缺失</p>
          <p className="mt-3 font-display text-xl leading-tight">
            你访问的页面不在目录中。可能已被重命名、移除，或从未存在。
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-3 border border-ink px-5 py-3 label transition hover:bg-ink hover:text-paper dark:border-bone dark:hover:bg-bone dark:hover:text-graphite"
          >
            返回目录
            <span aria-hidden>→</span>
          </Link>
        </aside>
      </div>
    </div>
  );
}
