"use client";

import { useLinkStatus } from "next/link";

type PendingLinkIndicatorProps = {
  className: string;
  overlayClassName?: string;
  label?: string;
};

export function PendingLinkIndicator({
  className,
  overlayClassName,
  label = "\u0423\u043d\u0448\u0438\u0436 \u0431\u0430\u0439\u043d\u0430",
}: PendingLinkIndicatorProps) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span
        className={className}
        data-pending={pending ? "true" : "false"}
        aria-live="polite"
        aria-label={pending ? label : undefined}
      >
        <span aria-hidden />
        <span>{label}</span>
      </span>
      {overlayClassName ? (
        <span
          className={overlayClassName}
          data-pending={pending ? "true" : "false"}
          aria-hidden
        >
          <span />
          <strong>{label}</strong>
        </span>
      ) : null}
    </>
  );
}
