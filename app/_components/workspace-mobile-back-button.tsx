"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";

import styles from "./workspace-header.module.css";

type WorkspaceMobileBackButtonProps = {
  fallbackHref?: string;
  showMobileBack?: boolean;
};

export function WorkspaceMobileBackButton({
  fallbackHref = "/",
  showMobileBack = true,
}: WorkspaceMobileBackButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasActionMessage = searchParams.has("notice") || searchParams.has("error");
  const shouldShowBack = showMobileBack && (pathname !== "/" || hasActionMessage);

  if (!shouldShowBack) {
    return (
      <span className={styles.mobileGreetingIcon} aria-hidden>
        <MapPin />
      </span>
    );
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      className={`${styles.mobileGreetingIcon} ${styles.mobileBackButton}`}
      onClick={handleBack}
      aria-label="Өмнөх хуудас руу буцах"
      title="Буцах"
    >
      <ArrowLeft aria-hidden />
      <span>Буцах</span>
    </button>
  );
}
