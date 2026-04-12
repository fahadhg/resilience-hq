'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border bg-surface-0/90 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-5 h-5 rounded-sm flex items-center justify-center" style={{ background: '#F15A22' }}>
            <span className="text-white text-[10px] font-bold leading-none">R</span>
          </div>
          <span className="font-display font-semibold text-sm tracking-tight">ResilienceHQ</span>
          <span className="text-ink-faint text-[11px] hidden sm:block border-l border-border pl-2.5">by NGen</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5">
          <Link
            href="/"
            className={clsx(
              'px-3 py-1.5 rounded text-xs transition-colors',
              pathname === '/' ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink'
            )}
          >
            Industries
          </Link>
          <Link
            href="/browse"
            className={clsx(
              'px-3 py-1.5 rounded text-xs transition-colors',
              pathname?.startsWith('/browse') ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink'
            )}
          >
            Toolkit
          </Link>
          <Link
            href="/intel"
            className={clsx(
              'px-3 py-1.5 rounded text-xs transition-colors',
              pathname?.startsWith('/intel') ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink'
            )}
          >
            Intel
          </Link>
          <a
            href="https://www.ngen.ca"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-faint hover:text-ink-muted text-xs px-3 py-1.5 transition-colors hidden sm:block"
          >
            NGen.ca ↗
          </a>
        </nav>

        {/* Data freshness */}
        <div className="text-[10px] text-ink-faint hidden md:flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-positive inline-block animate-pulse" />
          Live · 2026-04-10
        </div>
      </div>
    </header>
  );
}
