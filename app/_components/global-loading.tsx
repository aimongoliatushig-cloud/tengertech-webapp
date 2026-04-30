"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import styles from "./global-loading.module.css";

const DEFAULT_LOADING_MESSAGE = "Уншиж байна...";
const DEFAULT_SAVING_MESSAGE = "Хадгалж байна...";

type GlobalLoadingContextValue = {
  isLoading: boolean;
  message: string;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

function inferSubmitMessage(form: HTMLFormElement, submitter: HTMLElement | null) {
  const explicitMessage =
    submitter?.getAttribute("data-loading-label") ??
    form.getAttribute("data-loading-label");

  if (explicitMessage) {
    return explicitMessage;
  }

  const action = String(form.getAttribute("action") ?? "").toLowerCase();
  const submitText = (submitter?.textContent ?? "").trim().toLowerCase();
  const readOnlyHints = ["нэвтрэх", "гарах", "хайх", "шүүх", "татах", "харах"];

  if (action.includes("/auth/login") || action.includes("/auth/logout")) {
    return DEFAULT_LOADING_MESSAGE;
  }

  if (readOnlyHints.some((hint) => submitText.includes(hint))) {
    return DEFAULT_LOADING_MESSAGE;
  }

  return DEFAULT_SAVING_MESSAGE;
}

function shouldTrackFetch(input: RequestInfo | URL, init?: RequestInit) {
  const method =
    init?.method ??
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
  const normalizedMethod = String(method || "GET").toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(normalizedMethod);
}

function getHeaderValue(headers: HeadersInit | undefined, key: string) {
  if (!headers) {
    return "";
  }

  if (headers instanceof Headers) {
    return headers.get(key) ?? "";
  }

  if (Array.isArray(headers)) {
    return headers.find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1] ?? "";
  }

  return headers[key] ?? headers[key.toLowerCase()] ?? "";
}

function inferFetchMessage(input: RequestInfo | URL, init?: RequestInit) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : input.url;
  const hasNextAction = Boolean(getHeaderValue(init?.headers, "next-action"));
  const hasRouterState = Boolean(getHeaderValue(init?.headers, "next-router-state-tree"));

  if (url.includes("/api/wrs-report") || url.includes("/auth/login") || url.includes("/auth/logout")) {
    return DEFAULT_LOADING_MESSAGE;
  }

  if (hasRouterState && !hasNextAction) {
    return DEFAULT_LOADING_MESSAGE;
  }

  if (!url.includes("/api/") && !hasNextAction) {
    return DEFAULT_LOADING_MESSAGE;
  }

  return DEFAULT_SAVING_MESSAGE;
}

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [message, setMessage] = useState(DEFAULT_LOADING_MESSAGE);
  const [activeCount, setActiveCount] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didPathnameMountRef = useRef(false);
  const clickedSubmitFormsRef = useRef<WeakSet<HTMLFormElement>>(new WeakSet());

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const showLoading = useCallback(
    (nextMessage = DEFAULT_LOADING_MESSAGE) => {
      clearHideTimer();
      setMessage(nextMessage);
      setActiveCount((current) => current + 1);
    },
    [clearHideTimer],
  );

  const hideLoading = useCallback(() => {
    setActiveCount((current) => Math.max(0, current - 1));
  }, []);

  const hideAllLoading = useCallback(() => {
    clearHideTimer();
    setActiveCount(0);
  }, [clearHideTimer]);

  useEffect(() => {
    if (!didPathnameMountRef.current) {
      didPathnameMountRef.current = true;
      return;
    }

    hideAllLoading();
  }, [hideAllLoading, pathname]);

  useEffect(() => {
    const handleClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const submitter = target?.closest<HTMLButtonElement | HTMLInputElement>(
        'button[type="submit"], input[type="submit"], button:not([type])',
      );
      const form = submitter?.form ?? null;

      if (
        !submitter ||
        !form ||
        form.dataset.globalLoading === "false" ||
        submitter.disabled ||
        submitter.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }

      clickedSubmitFormsRef.current.add(form);
      showLoading(inferSubmitMessage(form, submitter));
    };

    const handleSubmitCapture = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || form.dataset.globalLoading === "false") {
        return;
      }

      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      if (!clickedSubmitFormsRef.current.has(form)) {
        showLoading(inferSubmitMessage(form, submitter));
      }
      clickedSubmitFormsRef.current.delete(form);

      window.setTimeout(() => {
        if (event.defaultPrevented) {
          hideLoading();
        }
      }, 0);
    };

    const handleInvalidCapture = () => {
      hideAllLoading();
    };

    const handlePageShow = () => hideAllLoading();

    document.addEventListener("click", handleClickCapture, true);
    document.addEventListener("submit", handleSubmitCapture, true);
    document.addEventListener("invalid", handleInvalidCapture, true);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("click", handleClickCapture, true);
      document.removeEventListener("submit", handleSubmitCapture, true);
      document.removeEventListener("invalid", handleInvalidCapture, true);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [hideAllLoading, hideLoading, showLoading]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const track = shouldTrackFetch(input, init);

      if (track) {
        showLoading(inferFetchMessage(input, init));
      }

      try {
        return await originalFetch(input, init);
      } finally {
        if (track) {
          hideLoading();
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [hideLoading, showLoading]);

  const value = useMemo<GlobalLoadingContextValue>(
    () => ({
      isLoading: activeCount > 0,
      message,
      showLoading,
      hideLoading,
    }),
    [activeCount, hideLoading, message, showLoading],
  );

  const isVisible = activeCount > 0;

  return (
    <GlobalLoadingContext.Provider value={value}>
      <Suspense fallback={null}>
        <SearchParamLoadingReset onChange={hideAllLoading} />
      </Suspense>
      {children}
      {isVisible ? (
        <div
          className={styles.overlay}
          role="status"
          aria-live="assertive"
          aria-busy="true"
          data-testid="global-loading-overlay"
        >
          <div className={styles.loaderPanel}>
            <span className={styles.spinner} aria-hidden="true" />
            <strong>{message}</strong>
          </div>
        </div>
      ) : null}
    </GlobalLoadingContext.Provider>
  );
}

function SearchParamLoadingReset({ onChange }: { onChange: () => void }) {
  const searchParams = useSearchParams();
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    onChange();
  }, [onChange, searchParams]);

  return null;
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);

  if (!context) {
    throw new Error("useGlobalLoading must be used inside GlobalLoadingProvider");
  }

  return context;
}

export function useOptionalGlobalLoading() {
  return useContext(GlobalLoadingContext);
}
