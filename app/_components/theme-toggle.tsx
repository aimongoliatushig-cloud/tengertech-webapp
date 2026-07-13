"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Өдөр/шөнийн горим сэлгэгч. Горимыг <html class="dark"> дээр тавьж,
 * localStorage-д хадгална. Анхны утгыг layout доторх скрипт (гялбахаас
 * сэргийлж) тавьсан байдаг тул энд зөвхөн уншиж, сэлгэнэ.
 * useSyncExternalStore ашигласнаар хэд хэдэн toggle (mobile + desktop)
 * нэг зэрэг зөв төлөвтэй байна.
 */
function subscribeToThemeClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function readIsDark() {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle({ className }: { className?: string }) {
  const isDark = useSyncExternalStore(subscribeToThemeClass, readIsDark, () => false);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage боломжгүй бол чимээгүй өнгөрнө
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Өдрийн горимд шилжих" : "Шөнийн горимд шилжих"}
      aria-pressed={isDark}
      title={isDark ? "Өдрийн горим" : "Шөнийн горим"}
      className={className}
      suppressHydrationWarning
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
