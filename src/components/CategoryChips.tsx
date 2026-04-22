interface Props {
  categories: string[];
  value: string | null;
  onChange: (c: string | null) => void;
}

export function CategoryChips({ categories, value, onChange }: Props) {
  const all = [{ key: null as string | null, label: '全部' }, ...categories.map((c) => ({ key: c, label: c }))];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="label text-ink/60 dark:text-bone/50">归类 /</span>
      {all.map(({ key, label }, idx) => {
        const active = value === key;
        return (
          <button
            key={label + idx}
            type="button"
            onClick={() => onChange(key)}
            className={`group relative pb-0.5 text-sm transition-colors ${
              active ? 'text-ink dark:text-bone' : 'text-ink/55 hover:text-ink dark:text-bone/50 dark:hover:text-bone'
            }`}
          >
            <span className="num mr-1 text-[11px] text-vermillion/80 dark:text-amber/80">
              {String(idx).padStart(2, '0')}
            </span>
            {label}
            <span
              aria-hidden
              className={`absolute inset-x-0 -bottom-0.5 h-px origin-left transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                active ? 'scale-x-100 bg-vermillion dark:bg-amber' : 'scale-x-0 bg-ink group-hover:scale-x-100 dark:bg-bone'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
