"use client";

import { useEffect, useState } from "react";

import { BellRing } from "lucide-react";

type NotificationPermissionButtonProps = {
  className: string;
};

type PermissionState = NotificationPermission | "unsupported" | "insecure";

export function NotificationPermissionButton({ className }: NotificationPermissionButtonProps) {
  const [permission, setPermission] = useState<PermissionState>("unsupported");
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    if (!window.isSecureContext) {
      setPermission("insecure");
      return;
    }

    setPermission(Notification.permission);
  }, []);

  async function requestPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    setIsRequesting(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
    } finally {
      setIsRequesting(false);
    }
  }

  if (permission === "unsupported" || permission === "granted") {
    return null;
  }

  if (permission === "denied") {
    return (
      <span
        className={className}
        data-state="denied"
        title="Browser дээр мэдэгдэл хаалттай байна"
      >
        Мэдэгдэл хаалттай
      </span>
    );
  }

  if (permission === "insecure") {
    return (
      <span className={className} data-state="denied" title="HTTPS дээр мэдэгдэл зөвшөөрөх боломжтой">
        HTTPS хэрэгтэй
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={requestPermission}
      disabled={isRequesting}
      aria-busy={isRequesting}
    >
      <BellRing aria-hidden />
      <span>{isRequesting ? "Асууж байна..." : "Мэдэгдэл асаах"}</span>
    </button>
  );
}
