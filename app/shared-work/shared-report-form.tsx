"use client";

import { useRef, useState } from "react";
import { Camera, Send } from "lucide-react";

import { createSharedWorkReportAction } from "@/app/shared-work/actions";
import type { SharedWorkDepartmentTask } from "@/lib/shared-work";
import styles from "@/app/workspace.module.css";

async function compressImage(file: File) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const maxSize = 1600;
  const ratio = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.74);
  });
  if (!blob) {
    return file;
  }

  const nextName = file.name.replace(/\.[^.]+$/, "") || "report-image";
  return new File([blob], `${nextName}.jpg`, { type: "image/jpeg" });
}

type SharedReportFormProps = {
  workId: number;
  tasks: SharedWorkDepartmentTask[];
};

export function SharedReportForm({ workId, tasks }: SharedReportFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageStatus, setImageStatus] = useState("");

  async function handleImagesChanged() {
    const input = inputRef.current;
    if (!input?.files?.length) {
      setImageStatus("");
      return;
    }

    setImageStatus("Зураг шахаж байна...");
    const compressed = await Promise.all(Array.from(input.files).slice(0, 8).map(compressImage));
    const dataTransfer = new DataTransfer();
    for (const file of compressed) {
      dataTransfer.items.add(file);
    }
    input.files = dataTransfer.files;
    setImageStatus(`${compressed.length} зураг бэлэн`);
  }

  return (
    <form action={createSharedWorkReportAction} className={styles.sharedWorkReportForm}>
      <input type="hidden" name="shared_work_id" value={workId} />
      <label className={styles.field}>
        <span>Хэлтсийн ажил</span>
        <select name="department_task_id" required>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.departmentName}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>Тайлан</span>
        <textarea name="note" rows={4} placeholder="Хийсэн ажил, асуудал, дараагийн алхам" required />
      </label>
      <div className={styles.sharedWorkInlineGrid}>
        <label className={styles.field}>
          <span>Өргөрөг</span>
          <input name="latitude" inputMode="decimal" />
        </label>
        <label className={styles.field}>
          <span>Уртраг</span>
          <input name="longitude" inputMode="decimal" />
        </label>
      </div>
      <label className={styles.sharedWorkUpload}>
        <Camera aria-hidden />
        <span>Зураг хавсаргах</span>
        <input
          ref={inputRef}
          type="file"
          name="images"
          accept="image/*"
          multiple
          onChange={handleImagesChanged}
        />
      </label>
      {imageStatus ? <p className={styles.sharedWorkUploadNote}>{imageStatus}</p> : null}
      <button type="submit" className={styles.primaryButton}>
        <Send aria-hidden />
        Тайлан хадгалах
      </button>
    </form>
  );
}
