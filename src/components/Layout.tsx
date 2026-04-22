import type { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
      {/* Outer frame — hairline border on the whole page */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {/* left & right vertical rules */}
        <div className="absolute inset-y-0 left-[max(1rem,calc((100vw-1400px)/2))] w-px bg-ink/10 dark:bg-bone/15" />
        <div className="absolute inset-y-0 right-[max(1rem,calc((100vw-1400px)/2))] w-px bg-ink/10 dark:bg-bone/15" />
      </div>

      <Header />
      <main className="relative z-10 flex-1">{children}</main>
      <Footer />
    </div>
  );
}
