"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";

type ProfileAvatarProps = {
  src?: string;
  alt?: string;
  className: string;
  imageClassName?: string;
  iconClassName?: string;
  "aria-hidden"?: boolean;
};

export function ProfileAvatar({
  src = "",
  alt = "",
  className,
  imageClassName,
  iconClassName,
  "aria-hidden": ariaHidden,
}: ProfileAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(src) && !imageFailed;

  return (
    <span className={className} aria-hidden={ariaHidden}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={imageClassName}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <UserRound className={iconClassName} aria-hidden />
      )}
    </span>
  );
}
