"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Sticky navigation that only exists once the hero is behind you.
 *
 * The hero's first frame is deliberately uncluttered -- wordmark, one line,
 * scroll cue -- so the nav must not appear until the pinned section releases.
 */
export function SiteNav() {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: "0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      <header
        className={`fixed inset-x-0 top-0 z-40 border-b border-hairline bg-bg/85 backdrop-blur-md transition-[opacity,transform] duration-300 ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
        }`}
      >
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-forest">
            GeoVision
          </Link>

          <div className="hidden items-center gap-8 text-sm text-muted sm:flex">
            <a href="#capabilities" className="transition-colors hover:text-forest">
              Capabilities
            </a>
            <a href="#pipeline" className="transition-colors hover:text-forest">
              Pipeline
            </a>
            <a href="#accuracy" className="transition-colors hover:text-forest">
              Accuracy
            </a>
          </div>

          <Link
            href="/app"
            className="rounded-full bg-green-bright px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green"
          >
            Try it
          </Link>
        </nav>
      </header>
    </>
  );
}
