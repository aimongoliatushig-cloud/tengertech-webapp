"use client";

import { useState, type MouseEvent, type ReactNode } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import styles from "./create.module.css";

type ActionCardLinkProps = {
  href: string;
  className: string;
  children: ReactNode;
};

export function ActionCardLink({ href, className, children }: ActionCardLinkProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    setPending(true);
    router.push(href);
  }

  return (
    <Link href={href} prefetch={false} className={className} onClick={handleClick}>
      {children}
      <span
        className={styles.actionLoadingHint}
        data-pending={pending ? "true" : "false"}
        aria-live="polite"
      >
        <span aria-hidden />
        <span>Уншиж байна</span>
      </span>
    </Link>
  );
}
