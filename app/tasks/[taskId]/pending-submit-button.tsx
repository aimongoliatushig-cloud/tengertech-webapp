"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import styles from "./task-detail.module.css";

type PendingSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel: string;
  forcePending?: boolean;
};

export function PendingSubmitButton({
  children,
  pendingLabel,
  forcePending = false,
  disabled,
  className,
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isPending = pending || forcePending;

  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      className={className}
      disabled={disabled || isPending}
      aria-busy={isPending}
      data-pending={isPending ? "true" : "false"}
    >
      {isPending ? (
        <>
          <span className={styles.submitSpinner} aria-hidden="true" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
