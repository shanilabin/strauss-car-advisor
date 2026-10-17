"use client";

import { useEffect, useState } from "react";

/**
 * How many pixels of the layout viewport the on-screen keyboard covers.
 * Stays at 0 when the browser already shrinks the layout (`interactive-widget=resizes-content`).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(covered > 1 ? Math.round(covered) : 0);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return inset;
}
