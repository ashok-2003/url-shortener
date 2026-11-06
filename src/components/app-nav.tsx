"use client";

import { ChartColumn, House, Link2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@/config/brand";

type NavItem = { href: "/" | "/links" | "/analytics"; label: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/links", label: "My links", icon: Link2 },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
];

function isActive(pathname: string, href: NavItem["href"]) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The app's three tabs. From 768px: a 232px left sidebar. Below: a slim top bar with the
 * brand and a bottom tab bar, since a sidebar doesn't fit on a phone.
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Phone: brand bar */}
      <div className="flex h-14 items-center justify-between border-b border-hairline px-4 md:hidden">
        <span className="font-display text-xl font-medium tracking-[-0.01em]">{brand.name}</span>
        <span className="font-mono text-xs tabular-nums text-ink-muted">user_demo</span>
      </div>

      {/* Desktop: sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-hairline bg-surface px-3 py-6 md:flex">
        <div className="px-3 pb-8">
          <p className="font-display text-2xl font-medium tracking-[-0.01em]">{brand.name}</p>
          <p className="text-xs text-ink-muted">{brand.description}</p>
        </div>
        <nav aria-label="Main">
          <ul className="flex flex-col gap-1">
            {ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-11 items-center gap-3 rounded-full px-3 text-sm outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-ink hover:bg-canvas"
                    }`}
                  >
                    <Icon aria-hidden className="size-[18px]" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="mt-auto px-3 font-mono text-xs tabular-nums text-ink-muted">user_demo</p>
      </aside>

      {/* Phone: bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid h-14 grid-cols-3">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                    active ? "font-medium text-primary" : "text-ink-muted"
                  }`}
                >
                  <Icon aria-hidden className="size-5" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
