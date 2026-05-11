import styles from "./loading-shell.module.css";

const DEFAULT_LOADING_MESSAGE = "Уншиж байна...";

type LoadingShellProps = {
  message?: string;
  mode?: "screen" | "overlay";
};

export function LoadingShell({
  message = DEFAULT_LOADING_MESSAGE,
  mode = "screen",
}: LoadingShellProps) {
  return (
    <div
      className={mode === "overlay" ? styles.overlay : styles.screen}
      role="status"
      aria-live={mode === "overlay" ? "assertive" : "polite"}
      aria-busy="true"
      data-testid={mode === "overlay" ? "global-loading-overlay" : "route-loading-screen"}
    >
      <div className={styles.panel}>
        <span className={styles.spinner} aria-hidden="true" />
        <strong>{message}</strong>
      </div>
    </div>
  );
}
