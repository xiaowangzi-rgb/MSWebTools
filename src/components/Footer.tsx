import { tools, visibleTools } from '@/tools/registry';

export function Footer() {
  const toolsCount = visibleTools.length;
  const totalCount = tools.length;
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 mt-24 border-t border-ink dark:border-bone">
      {/* Marquee strip — like a colophon footer stamp */}
      <div className="overflow-hidden border-b border-ink/80 dark:border-bone/70 bg-ink text-paper dark:bg-bone dark:text-graphite">
        <div className="flex whitespace-nowrap animate-marquee">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex shrink-0 items-center gap-8 py-2 pr-8">
              {[
                '网页工具目录',
                '字体选用 Fraunces 与 JetBrains Mono',
                '自制出品',
                '持续更新',
                '无追踪 · 无广告',
                '归类：软件',
                '第 01 卷',
              ].map((text, j) => (
                <span key={j} className="label flex items-center gap-8">
                  {text}
                  <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-paper/70 dark:bg-graphite/70" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1400px] gap-6 px-6 py-10 sm:grid-cols-12">
        <div className="sm:col-span-5">
          <p className="label text-ink/60 dark:text-bone/50">版本说明</p>
          <p className="mt-2 font-display text-xl leading-tight tracking-display sm:text-2xl">
            一本手工编排的<em className="italic font-light">内部网页工具</em>目录，
            自动发现，持续索引。
          </p>
        </div>

        <div className="sm:col-span-3">
          <p className="label text-ink/60 dark:text-bone/50">排版</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li><span className="font-display">Fraunces</span> <span className="num text-xs text-ink/60 dark:text-bone/50">— 标题</span></li>
            <li className="num">JetBrains Mono <span className="text-xs text-ink/60 dark:text-bone/50">— 技术</span></li>
            <li>Archivo <span className="num text-xs text-ink/60 dark:text-bone/50">— 正文</span></li>
          </ul>
        </div>

        <div className="sm:col-span-2">
          <p className="label text-ink/60 dark:text-bone/50">条目</p>
          <p className="num mt-2 text-3xl font-medium">{String(toolsCount).padStart(3, '0')}</p>
          <p className="label text-ink/50 dark:text-bone/40">
            共 {String(totalCount).padStart(3, '0')} 项已注册
          </p>
        </div>

        <div className="sm:col-span-2 sm:text-right">
          <p className="label text-ink/60 dark:text-bone/50">出品</p>
          <p className="mt-2 text-sm">© {year} MSWT</p>
          <p className="label text-ink/50 dark:text-bone/40">版权所有</p>
        </div>
      </div>
    </footer>
  );
}
