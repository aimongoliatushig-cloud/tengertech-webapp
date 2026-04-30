"use client";

import { useEffect } from "react";
import { useLinkStatus } from "next/link";

import { useOptionalGlobalLoading } from "./global-loading";

type PendingLinkIndicatorProps = {
  className: string;
  overlayClassName?: string;
  label?: string;
};

export function PendingLinkIndicator({
  className,
  label = "Уншиж байна...",
}: PendingLinkIndicatorProps) {
  const { pending } = useLinkStatus();
  const globalLoading = useOptionalGlobalLoading();
  const loadingLabel = label === "..." ? "Уншиж байна..." : label;

  useEffect(() => {
    if (!pending || !globalLoading) {
      return;
    }

    globalLoading.showLoading(loadingLabel);
    return () => globalLoading.hideLoading();
  }, [globalLoading, loadingLabel, pending]);

  return (
    <span
      className={className}
      data-pending={pending ? "true" : "false"}
      aria-live="polite"
      aria-label={pending ? loadingLabel : undefined}
    >
      <span aria-hidden />
      <span>{loadingLabel}</span>
    </span>
  );
}
