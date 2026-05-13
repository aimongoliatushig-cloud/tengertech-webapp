"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";

import { ProfileAvatar } from "@/app/_components/profile-avatar";

import styles from "./profile.module.css";

type ProfilePhotoUploadProps = {
  action: (formData: FormData) => void | Promise<void>;
  imageUrl: string;
  userName: string;
};

export function ProfilePhotoUpload({
  action,
  imageUrl,
  userName,
}: ProfilePhotoUploadProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form ref={formRef} action={action} className={styles.mobileAvatarForm}>
      <ProfileAvatar
        src={imageUrl}
        alt={`${userName} профайл зураг`}
        className={styles.mobileProfileAvatar}
        imageClassName={styles.mobileProfileAvatarImage}
        iconClassName={styles.mobileProfileAvatarIcon}
        aria-hidden={!imageUrl}
      />
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
