"use client";

import { Camera, LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import styles from "./fleet-report.module.css";

type ReportImage = { id: number; name: string; url: string };

export function FleetReportImages({
  model,
  recordId,
  images,
}: {
  model: "municipal.garbage.fuel.report" | "municipal.garbage.weight.report" | "fleet.vehicle.odometer";
  recordId: number;
  images: ReportImage[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.set("model", model);
      body.set("recordId", String(recordId));
      body.set("image", file);
      const response = await fetch("/api/reports/fleet-images", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Зураг хадгалж чадсангүй.");
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Зураг хадгалж чадсангүй.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={styles.reportImagesCell}>
      <div className={styles.reportImageList}>
        {images.map((image) => (
          <a key={image.id} href={image.url} target="_blank" rel="noreferrer" title={image.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.name} />
          </a>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.hiddenImageInput}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        className={styles.addImageButton}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <LoaderCircle className={styles.spin} size={15} /> : images.length ? <Plus size={15} /> : <Camera size={15} />}
        {uploading ? "Хадгалж байна" : images.length ? "Нэмэх" : "Зураг"}
      </button>
      {error ? <small className={styles.imageError}>{error}</small> : null}
    </div>
  );
}
