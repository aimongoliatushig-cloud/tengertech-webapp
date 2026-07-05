"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Өдөр/шөнийн горим сэлгэгч. Горимыг <html class="dark"> дээр тавьж,
 * localStorage-д хадгална. Анхны утгыг layout доторх скрипт (гялбахаас
 * сэргийлж) тавьсан байдаг тул энд зөвхөн уншиж, сэлгэнэ.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setReady(true);
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage боломжгүй бол чимээгүй өнгөрнө
    }
    setIsDark(next);
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
      {ready && isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
