import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import type { ToolMeta } from '@/tools/types';

interface Props {
  meta: ToolMeta;
  index: number;
}

// Tailwind color -> concrete hex so accents survive without dynamic classes.
const COLOR_MAP: Record<string, string> = {
  'red-500': '#ef4444', 'red-600': '#dc2626',
  'orange-500': '#f97316', 'orange-600': '#ea580c',
  'amber-500': '#f59e0b', 'amber-400': '#fbbf24',
  'yellow-500': '#eab308',
  'lime-500': '#84cc16',
  'green-500': '#22c55e', 'green-600': '#16a34a',
  'emerald-400': '#34d399', 'emerald-500': '#10b981', 'emerald-600': '#059669',
  'teal-500': '#14b8a6', 'teal-600': '#0d9488',
  'cyan-500': '#06b6d4',
  'sky-500': '#0ea5e9',
  'blue-500': '#3b82f6', 'blue-600': '#2563eb',
  'indigo-500': '#6366f1', 'indigo-600': '#4f46e5',
  'violet-500': '#8b5cf6',
  'purple-500': '#a855f7',
  'fuchsia-500': '#d946ef',
  'pink-500': '#ec4899',
  'rose-500': '#f43f5e',
  'slate-500': '#64748b',
  'stone-500': '#78716c',
  brand: '#D94A2A',
};

function pickAccentColor(accent: string | undefined): string {
  if (!accent) return COLOR_MAP.brand;
  const m = /from-([a-z]+-\d{3})/.exec(accent);
  return (m && COLOR_MAP[m[1]]) || COLOR_MAP.brand;
}

export function ToolCard({ meta, index }: Props) {
  const Icon = meta.icon ?? Sparkles;
  const accentColor = pickAccentColor(meta.accent);
  const idx = String(index + 1).padStart(3, '0');

  return (
    <Link
      to={`/tools/${meta.slug}`}
      className="catalog-entry group block p-5 sm:p-6"
    >
      {/* Header row: index + category + icon box */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="num text-[11px] tracking-wider text-ink/60 dark:text-bone/50">
            № {idx}
          </span>
          <span aria-hidden className="h-3 w-px bg-ink/30 dark:bg-bone/30" />
          <span className="label text-ink/70 dark:text-bone/60">
            {meta.category || '未分类'}
          </span>
        </div>
        <div className="relative">
          <div className="flex h-10 w-10 items-center justify-center border border-ink text-ink transition group-hover:bg-ink group-hover:text-paper dark:border-bone dark:text-bone dark:group-hover:bg-bone dark:group-hover:text-graphite">
            <Icon size={18} strokeWidth={1.5} />
          </div>
          <span
            aria-hidden
            className="absolute -right-1 -bottom-1 h-2.5 w-2.5"
            style={{ backgroundColor: accentColor }}
          />
        </div>
      </div>

      {/* Title — serif, large, tracked tightly */}
      <h3 className="mt-6 font-display text-[1.75rem] font-medium leading-[1.05] tracking-display text-balance">
        {meta.name}
      </h3>

      {/* Description */}
      <p className="mt-2 line-clamp-2 text-sm text-ink/70 dark:text-bone/60 text-pretty">
        {meta.description}
      </p>

      {/* Divider */}
      <div className="mt-5 rule opacity-40 group-hover:opacity-100 transition-opacity" />

      {/* Footer row: slug + tags + CTA */}
      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="num truncate text-[11px] text-ink/55 dark:text-bone/45">
            /tools/{meta.slug}
          </p>
          {meta.tags && meta.tags.length > 0 && (
            <p className="num mt-1 truncate text-[11px] text-ink/40 dark:text-bone/35">
              {meta.tags.slice(0, 4).map((t) => `#${t}`).join('  ')}
            </p>
          )}
        </div>
        <span className="label shrink-0 text-ink/70 transition-all group-hover:text-vermillion dark:text-bone/60 dark:group-hover:text-amber">
          打开
          <span
            aria-hidden
            className="ml-1 inline-block transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
