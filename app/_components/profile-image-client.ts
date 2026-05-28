"use client";

import { useEffect, useState } from "react";

let cachedProfileImageUrl = "";
let profileImageRequest: Promise<string> | null = null;

function loadProfileImageUrl() {
  if (cachedProfileImageUrl) {
    return Promise.resolve(cachedProfileImageUrl);
  }

  if (!profileImageRequest) {
    profileImageRequest = fetch("/api/profile-image", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { imageUrl?: string } | null) => {
        cachedProfileImageUrl = payload?.imageUrl || "";
        return cachedProfileImageUrl;
      })
      .catch(() => "");
  }

  return profileImageRequest;
}

export function useProfileImageUrl(initialImageUrl = "") {
  const [imageUrl, setImageUrl] = useState(() => initialImageUrl);

  useEffect(() => {
    if (initialImageUrl) {
      return;
    }

    let isMounted = true;
    loadProfileImageUrl().then((loadedImageUrl) => {
      if (isMounted && loadedImageUrl) {
        setImageUrl(loadedImageUrl);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [initialImageUrl]);

  return imageUrl;
}
