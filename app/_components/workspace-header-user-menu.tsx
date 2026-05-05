"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { ChevronDown, LogOut, Settings } from "lucide-react";

import styles from "./workspace-header.module.css";

type WorkspaceHeaderUserMenuProps = {
  userName: string;
  roleLabel: string;
};

export function WorkspaceHeaderUserMenu({
  userName,
  roleLabel,
}: WorkspaceHeaderUserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={styles.headerUserWrap} ref={wrapperRef}>
      <button
        type="button"
        className={styles.headerUser}
        aria-expanded={isOpen}
        aria-controls="workspace-header-account-menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className={styles.headerUserText}>
          <strong>{userName}</strong>
          <small>{roleLabel}</small>
        </span>
        <ChevronDown
          aria-hidden
          className={isOpen ? styles.headerUserChevronOpen : undefined}
        />
      </button>

      {isOpen ? (
        <div
          id="workspace-header-account-menu"
          className={styles.headerUserMenu}
          role="menu"
        >
          <Link
            href="/profile"
            role="menuitem"
            className={styles.headerUserMenuLink}
            onClick={() => setIsOpen(false)}
          >
            <Settings aria-hidden />
            <span>Тохиргоо</span>
          </Link>
          <Link
            href="/auth/logout"
            role="menuitem"
            className={styles.headerUserMenuLink}
            onClick={() => setIsOpen(false)}
          >
            <LogOut aria-hidden />
            <span>Гарах</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
