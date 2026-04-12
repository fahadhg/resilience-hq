'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border bg-surface-0/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <div className="w-8 h-8 rounded-md flex items-center justify-center bg-ngen shadow-sm shadow-ngen/20 group-hover:shadow-ngen/30 transition-shadow">
            <span className="text-white text-xs font-bold leading-none tracking-tight">RHQ</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-tight leading-none">ResilienceHQ</span>
            <span className="text-ink-faint text-[10px] mt-0.5 hidden sm:block">Canadian Tariff Intelligence</span>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className={clsx(
              'px-4 py-2 rounded-md text-sm transition-colors',
              pathname === '/' ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-1'
            )}
          >
            Industries
          </Link>
          <Link
            href="/browse"
            className={clsx(
              'px-4 py-2 rounded-md text-sm transition-colors',
              pathname?.startsWith('/browse') ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-1'
            )}
          >
            Toolkit
          </Link>
          <Link
            href="/intel"
            className={clsx(
              'px-4 py-2 rounded-md text-sm transition-colors',
              pathname?.startsWith('/intel') ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-1'
            )}
          >
            Intel
          </Link>
          <div className="w-px h-5 bg-border mx-2 hidden sm:block" />
          <a
            href="https://www.ngen.ca"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-faint hover:text-ngen text-sm px-3 py-2 transition-colors hidden sm:flex items-center gap-1.5"
          >
            NGen.ca
            <ExternalLink className="w-3 h-3" />
          </a>
        </nav>

        {/* Data freshness badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-1 border border-border">
          <span className="live-dot" />
          <span className="text-[11px] text-ink-muted font-medium">Live Data</span>
          <span className="text-[10px] text-ink-faint">2026-04-10</span>
        </div>
      </div>
    </header>
  );
}
