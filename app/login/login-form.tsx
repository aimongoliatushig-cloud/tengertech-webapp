"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form
      action="/auth/login"
      method="post"
      className={className}
      data-loading-label="Уншиж байна..."
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
        <span style={{ position: "relative", display: "block" }}>
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Нууц үгээ оруулна уу"
            autoComplete="current-password"
            enterKeyHint="go"
            required
            style={{ paddingRight: 48 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Нууц үг нуух" : "Нууц үг харах"}
            aria-pressed={showPassword}
            style={{
              position: "absolute",
              top: "50%",
              right: 10,
              transform: "translateY(-50%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              padding: 0,
              border: 0,
              borderRadius: 8,
              background: "transparent",
              color: "#5f7563",
              cursor: "pointer",
            }}
          >
            {showPassword ? <EyeOff size={19} aria-hidden /> : <Eye size={19} aria-hidden />}
          </button>
        </span>
      </label>

      {errorMessage ? <p className={errorClassName}>{errorMessage}</p> : null}

      <button type="submit" className={submitButtonClassName}>
        Нэвтрэх
      </button>
    </form>
  );
}
