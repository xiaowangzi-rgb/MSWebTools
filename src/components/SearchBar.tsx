import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="group relative flex items-end border-b border-ink pb-2 transition-colors focus-within:border-vermillion dark:border-bone dark:focus-within:border-amber">
      <label htmlFor="toolsearch" className="label mr-3 pb-1 text-ink/60 dark:text-bone/50">
        查询 /
      </label>
      <span className="num mr-2 pb-1 text-vermillion dark:text-amber">▸</span>
      <input
        id="toolsearch"
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '搜索工具 · 分类 · 标签'}
        className="peer flex-1 bg-transparent font-display text-2xl font-light tracking-display placeholder:text-ink/30 dark:placeholder:text-bone/25 sm:text-3xl"
        style={{ fontVariationSettings: "'SOFT' 40, 'opsz' 100" }}
      />
      <span className="num pb-1.5 text-[10px] text-ink/50 dark:text-bone/40 opacity-100 peer-focus:opacity-40 hidden sm:inline">
        ⌘K
      </span>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="清除搜索"
          className="ml-3 label pb-1 text-ink/60 underline underline-offset-4 transition hover:text-vermillion dark:text-bone/50 dark:hover:text-amber"
        >
          清除 ×
        </button>
      )}
    </div>
  );
}
