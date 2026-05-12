"use client";

import { useRef } from "react";
import Image from "next/image";
import { Camera } from "lucide-react";

import styles from "./profile.module.css";

type ProfilePhotoUploadProps = {
  action: (formData: FormData) => void | Promise<void>;
  imageUrl: string;
  initials: string;
  userName: string;
};

export function ProfilePhotoUpload({
  action,
  imageUrl,
  initials,
  userName,
}: ProfilePhotoUploadProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form ref={formRef} action={action} className={styles.mobileAvatarForm}>
      <span className={styles.mobileProfileAvatar} aria-hidden={!imageUrl}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`${userName} профайл зураг`}
            width={104}
            height={104}
            className={styles.mobileProfileAvatarImage}
            unoptimized
          />
        ) : (
          initials
        )}
      </span>
      <button
        type="button"
        className={styles.mobileCameraButton}
        aria-label="Профайл зураг солих"
        onClick={() => inputRef.current?.click()}
      >
        <Camera aria-hidden />
      </button>
      <input
        ref={inputRef}
        className={styles.mobilePhotoInput}
        name="profile_photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
