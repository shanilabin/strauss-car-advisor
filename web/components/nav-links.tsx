"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

/** The home page's sections that have their own link, top to bottom. */
const SECTIONS = ["how", "faq"] as const;
const TOPBAR_OFFSET = 120; // a section counts as "on screen" once its top passes under the top bar

/**
 * Which home-page link is current: the section scrolled to, else the home page itself (QA B09).
 * Other pages keep the `active` they were given.
 */
function useCurrentSection(active: string): string {
  const [section, setSection] = useState<string | null>(null);
  const tracking = active === "/";

  useEffect(() => {
    if (!tracking) return;
    function update() {
      // The last section can be too short to ever scroll under the top bar: at the page's end, it is current
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const reached = SECTIONS.filter((id) => {
        const el = document.getElementById(id);
        return el != null && (el.getBoundingClientRect().top <= TOPBAR_OFFSET || (atEnd && window.scrollY > 0));
      });
      setSection(reached.length > 0 ? `/#${reached[reached.length - 1]}` : null);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("hashchange", update);
    };
  }, [tracking]);

  return tracking ? (section ?? "/") : active;
}

export function NavLinks({ items, active }: { items: NavItem[]; active: string }) {
  const current = useCurrentSection(active);
  return (
    <nav aria-label="ניווט ראשי" className="max-md:hidden">
      <ul className="flex items-center gap-1 lg:gap-3">
        {items.map((item) => {
          const isCurrent = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isCurrent ? (item.href.includes("#") ? "location" : "page") : undefined}
                className={cn(
                  "relative inline-flex h-11 items-center px-3 text-[0.95rem] font-medium transition-colors hover:text-primary",
                  isCurrent && "font-bold",
                  "after:absolute after:inset-x-3 after:bottom-1 after:h-[3px] after:rounded-full after:bg-brand-red after:transition-opacity",
                  isCurrent ? "after:opacity-100" : "after:opacity-0 hover:after:opacity-40",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
