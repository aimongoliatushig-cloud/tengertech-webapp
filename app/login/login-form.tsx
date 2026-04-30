"use client";

import { useRef } from "react";

import { useGlobalLoading } from "@/app/_components/global-loading";

type LoginFormProps = {
  className: string;
  fieldClassName: string;
  submitButtonClassName: string;
  errorMessage?: string;
  errorClassName: string;
};

export function LoginForm({
  className,
  fieldClassName,
  submitButtonClassName,
  errorMessage,
  errorClassName,
}: LoginFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmittingRef = useRef(false);
  const { hideLoading, showLoading } = useGlobalLoading();

  return (
    <form
      ref={formRef}
      action="/auth/login"
      method="post"
      className={className}
      data-global-loading="false"
      data-loading-label="Уншиж байна..."
      onSubmit={async (event) => {
        if (isSubmittingRef.current) {
          return;
        }

        event.preventDefault();
        isSubmittingRef.current = true;
        showLoading("Уншиж байна...");

        try {
          const response = await fetch("/auth/login", {
            method: "POST",
            body: new FormData(event.currentTarget),
            credentials: "same-origin",
            redirect: "manual",
          });
          const redirectTarget =
            response.headers.get("location") ??
            (response.ok ? "/" : "/login?error=connection");

          window.location.assign(redirectTarget);
        } catch {
          isSubmittingRef.current = false;
          hideLoading();
          window.location.assign("/login?error=connection");
        }
      }}
    >
      <label className={fieldClassName} htmlFor="login-name">
        <span>Нэвтрэх нэр</span>
        <input
          id="login-name"
          name="login"
          type="text"
          placeholder="Нэвтрэх нэрээ оруулна уу"
          autoComplete="username"
          enterKeyHint="next"
          required
        />
      </label>

      <label className={fieldClassName} htmlFor="login-password">
        <span>Нууц үг</span>
        <input
          id="login-password"
          name="password"
          type="password"
          placeholder="Нууц үгээ оруулна уу"
          autoComplete="current-password"
          enterKeyHint="go"
          required
        />
      </label>

      {errorMessage ? <p className={errorClassName}>{errorMessage}</p> : null}

      <button type="submit" className={submitButtonClassName}>
        Нэвтрэх
      </button>
    </form>
  );
}
