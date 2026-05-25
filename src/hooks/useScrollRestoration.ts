// src/hooks/useScrollRestoration.ts
import { useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "scroll:";

// Saves the scroll position of the element matching `selector` to
// sessionStorage on every scroll, and restores it once `ready` is true.
//
// The save listener stays attached across `ready` toggles so programmatic
// scrolls during loading windows (e.g. scroll-to-top on pagination) are
// captured. The container is re-located whenever `ready` becomes true,
// which handles pages where the scroll container is inside a child
// component that unmounts during loading.
//
// Restoration happens at most once per mount.
export const useScrollRestoration = (
  key: string,
  ready: boolean = true,
  selector: string = "main"
) => {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const hasRestoredRef = useRef(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  // Locate the scroll container. Re-runs whenever `ready` flips true so
  // pages whose container is inside a conditionally-rendered child get
  // picked up after the loading state clears (and re-picked up if the
  // child remounts later, e.g. after a refetch).
  useEffect(() => {
    if (!ready) return;
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el && el !== container) setContainer(el);
  }, [ready, selector, container]);

  // Attach the scroll listener to the located container. Deps deliberately
  // exclude `ready` — once attached, the listener should persist through
  // loading toggles so programmatic scrolls (clamping, scroll-to-top) get
  // saved.
  useEffect(() => {
    if (!container) return;
    const handleScroll = () => {
      sessionStorage.setItem(storageKey, String(container.scrollTop));
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [container, storageKey]);

  // Restore once the container is found. The container is only set when
  // `ready` is true, so this implicitly waits for content to be rendered.
  useEffect(() => {
    if (!container || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = sessionStorage.getItem(storageKey);
    if (saved === null) return;

    const target = parseInt(saved, 10);
    if (Number.isNaN(target)) return;

    requestAnimationFrame(() => {
      container.scrollTop = target;
    });
  }, [container, storageKey]);
};
