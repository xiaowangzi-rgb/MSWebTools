import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      className="group relative flex h-9 items-center border border-ink dark:border-bone"
    >
      {/* Sliding indicator */}
      <span
        aria-hidden
        className={`absolute top-0 bottom-0 w-1/2 bg-ink transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] dark:bg-bone ${
          isDark ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      <span
        className={`relative z-10 flex h-full w-8 items-center justify-center label transition-colors ${
          !isDark ? 'text-paper' : 'text-ink/50 dark:text-bone/50'
        }`}
      >
        亮
      </span>
      <span
        className={`relative z-10 flex h-full w-8 items-center justify-center label transition-colors ${
          isDark ? 'text-graphite' : 'text-ink/50 dark:text-bone/50'
        }`}
      >
        暗
      </span>
    </button>
  );
}
