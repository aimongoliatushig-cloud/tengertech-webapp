"use client";

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
