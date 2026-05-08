"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import styles from "./task-detail.module.css";

type PendingSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel: string;
};

export function PendingSubmitButton({
  children,
  pendingLabel,
  disabled,
  className,
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
      data-pending={pending ? "true" : "false"}
    >
      {pending ? (
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
