"use client";

import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImagePlus, Mic, Plus, RotateCcw, Square, X } from "lucide-react";

import styles from "./task-detail.module.css";
import type { TaskQuantityLine } from "@/lib/workspace";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  taskId: number;
  defaultOpen?: boolean;
  quantityOptional?: boolean;
  measurementUnit?: string;
  quantityLines?: TaskQuantityLine[];
  variant?: "default" | "hero";
  requireQuantity?: boolean;
  simpleMobile?: boolean;
  workItemName?: string;
  triggerClassName?: string;
  triggerContent?: ReactNode;
};

type PhotoReportFieldProps = {
  id: string;
  name: string;
  label: string;
  maxFiles: number;
  emptyStateLabel: string;
};

type PhotoPreview = {
  id: string;
  name: string;
  source: "gallery" | "camera";
  sourceIndex: number;
  url: string;
};

function PhotoReportField({ id, name, label, maxFiles, emptyStateLabel }: PhotoReportFieldProps) {
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const captureSequenceRef = useRef(0);
  const [selectedFiles, setSelectedFiles] = useState<PhotoPreview[]>([]);
  const [limitMessage, setLimitMessage] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const syncSelectedFiles = () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];

    const galleryFiles = Array.from(galleryInputRef.current?.files ?? []);
    const cameraFiles = Array.from(cameraInputRef.current?.files ?? []);
    const previews = [
      ...galleryFiles.map((file, index) => ({
        id: `gallery-${file.name}-${file.lastModified}-${index}`,
        name: file.name,
        source: "gallery" as const,
        sourceIndex: index,
        url: URL.createObjectURL(file),
      })),
      ...cameraFiles.map((file, index) => ({
        id: `camera-${file.name}-${file.lastModified}-${index}`,
        name: file.name,
        source: "camera" as const,
        sourceIndex: index,
        url: URL.createObjectURL(file),
      })),
    ];
    previewUrlsRef.current = previews.map((preview) => preview.url);
    setSelectedFiles(previews);
  };

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStream(null);
    setCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen || !cameraStream || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    video.srcObject = cameraStream;
    video.muted = true;
    video.playsInline = true;

    const playVideo = () => {
      void video.play().catch(() => {
        setCameraError("Камер нээгдсэн боловч дүрс тоглуулахад алдаа гарлаа. Камерын зөвшөөрлөө шалгаад дахин оролдоно уу.");
      });
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      playVideo();
    } else {
      video.addEventListener("loadedmetadata", playVideo, { once: true });
    }

    return () => {
      video.removeEventListener("loadedmetadata", playVideo);
      if (video.srcObject === cameraStream) {
        video.srcObject = null;
      }
    };
  }, [cameraOpen, cameraStream]);

  const assignFilesToInput = (input: HTMLInputElement, files: File[]) => {
    const dataTransfer = new DataTransfer();
    files.slice(0, maxFiles).forEach((file) => dataTransfer.items.add(file));
    input.files = dataTransfer.files;
  };

  const limitInputFiles = (event: ChangeEvent<HTMLInputElement>, otherInput: HTMLInputElement | null) => {
    const otherCount = otherInput?.files?.length ?? 0;
    const allowedCount = Math.max(maxFiles - otherCount, 0);
    const files = Array.from(event.target.files ?? []);
    const limitedFiles = files.slice(0, allowedCount);

    if (files.length > limitedFiles.length) {
      const dataTransfer = new DataTransfer();
      limitedFiles.forEach((file) => dataTransfer.items.add(file));
      event.target.files = dataTransfer.files;
      setLimitMessage(`Дээд тал нь ${maxFiles} зураг оруулна.`);
    } else {
      setLimitMessage("");
    }
  };

  const handleGalleryChange = (event: ChangeEvent<HTMLInputElement>) => {
    limitInputFiles(event, cameraInputRef.current);
    syncSelectedFiles();
  };

  const handleCameraChange = (event: ChangeEvent<HTMLInputElement>) => {
    limitInputFiles(event, galleryInputRef.current);
    syncSelectedFiles();
  };

  const handleClear = () => {
    if (galleryInputRef.current) {
      galleryInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
    setSelectedFiles([]);
    setLimitMessage("");
  };

  const handleRemove = (source: PhotoPreview["source"], sourceIndex: number) => {
    const targetInput = source === "gallery" ? galleryInputRef.current : cameraInputRef.current;
    if (!targetInput) {
      return;
    }
    const files = Array.from(targetInput.files ?? []).filter((_, index) => index !== sourceIndex);
    assignFilesToInput(targetInput, files);
    syncSelectedFiles();
  };

  const handleOpenCamera = async () => {
    setCameraError("");
    const existingCount =
      (galleryInputRef.current?.files?.length ?? 0) + (cameraInputRef.current?.files?.length ?? 0);
    if (existingCount >= maxFiles) {
      setLimitMessage(`Дээд тал нь ${maxFiles} зураг оруулна.`);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraOpen(true);
    } catch {
      setCameraError("Камер ашиглах зөвшөөрөл өгөөд дахин оролдоно уу.");
      cameraInputRef.current?.click();
    }
  };

  const handleCapturePhoto = async () => {
    const video = videoRef.current;
    const input = cameraInputRef.current;
    if (!video || !input || !video.videoWidth || !video.videoHeight) {
      setCameraError("Камерын зураг бэлэн болоогүй байна.");
      return;
    }

    const existingCount = (galleryInputRef.current?.files?.length ?? 0) + (input.files?.length ?? 0);
    if (existingCount >= maxFiles) {
      setLimitMessage(`Дээд тал нь ${maxFiles} зураг оруулна.`);
      stopCamera();
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setCameraError("Зураг хадгалах боломжгүй байна.");
      return;
    }

    captureSequenceRef.current += 1;
    const file = new File([blob], `camera-${captureSequenceRef.current}.jpg`, { type: "image/jpeg" });
    assignFilesToInput(input, [...Array.from(input.files ?? []), file]);
    syncSelectedFiles();
    stopCamera();
  };

  const statusLabel = selectedFiles.length ? `${selectedFiles.length}/${maxFiles}` : emptyStateLabel;

  return (
    <div className={styles.reportMediaField}>
      <div className={styles.reportMediaHeader}>
        <div>
          <strong>{label}</strong>
          <small>Зураг сонгох эсвэл камераар шууд дарах</small>
        </div>
        <span>{statusLabel}</span>
      </div>

      <input
        ref={galleryInputRef}
        id={`${id}-gallery`}
        name={name}
        type="file"
        accept="image/*"
        multiple
        className={styles.hiddenFileInput}
        onChange={handleGalleryChange}
      />
      <input
        ref={cameraInputRef}
        id={`${id}-camera`}
        name={name}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.hiddenFileInput}
        onChange={handleCameraChange}
      />

      <div className={styles.reportMediaActions}>
        <button type="button" className={styles.mediaActionButton} onClick={() => galleryInputRef.current?.click()}>
          <ImagePlus size={18} strokeWidth={2.4} aria-hidden="true" />
          Зураг сонгох
        </button>
        <button type="button" className={styles.mediaActionButtonPrimary} onClick={handleOpenCamera}>
          <Camera size={18} strokeWidth={2.4} aria-hidden="true" />
          Шууд дарах
        </button>
      </div>

      {cameraOpen ? (
        <div className={styles.cameraCapturePanel}>
          <video ref={videoRef} autoPlay playsInline muted />
          <div className={styles.cameraCaptureActions}>
            <button type="button" className={styles.mediaActionButton} onClick={stopCamera}>
              Болих
            </button>
            <button type="button" className={styles.mediaActionButtonPrimary} onClick={handleCapturePhoto}>
              <Camera size={18} strokeWidth={2.4} aria-hidden="true" />
              Зураг оруулах
            </button>
          </div>
        </div>
      ) : null}
      {cameraError ? <p className={styles.fileLimitMessage}>{cameraError}</p> : null}

      {selectedFiles.length ? (
        <div className={styles.mediaPreviewList}>
          {selectedFiles.map((file) => (
            <figure key={file.id} className={styles.mediaPreviewTile}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file.url} alt={file.name} />
              <button
                type="button"
                aria-label={`${file.name} устгах`}
                onClick={() => handleRemove(file.source, file.sourceIndex)}
              >
                <X size={15} strokeWidth={2.6} aria-hidden="true" />
              </button>
            </figure>
          ))}
          {selectedFiles.length < maxFiles ? (
            <button type="button" className={styles.mediaAddTile} onClick={() => galleryInputRef.current?.click()}>
              <Plus size={22} strokeWidth={2.3} aria-hidden="true" />
              <span>Нэмэх</span>
            </button>
          ) : null}
        </div>
      ) : (
        <p className={styles.mediaEmptyText}>{emptyStateLabel}</p>
      )}

      <div className={styles.reportMediaFooter}>
        <small>Дээд тал нь {maxFiles} зураг</small>
        {selectedFiles.length ? (
          <button type="button" onClick={handleClear}>
            Цэвэрлэх
          </button>
        ) : null}
      </div>
      {limitMessage ? <p className={styles.fileLimitMessage}>{limitMessage}</p> : null}
    </div>
  );
}

type AudioRecorderStatus = "idle" | "recording" | "ready" | "error";

function AudioRecorderField() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioUrlRef = useRef<string>("");
  const startedAtRef = useRef<number>(0);
  const audioSequenceRef = useRef(0);
  const [status, setStatus] = useState<AudioRecorderStatus>("idle");
  const [audioUrl, setAudioUrl] = useState("");
  const [durationLabel, setDurationLabel] = useState("");
  const [message, setMessage] = useState("Файл сонгохгүй, зөвхөн микрофоноор шууд бичнэ.");

  const clearAudioUrl = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = "";
    }
    setAudioUrl("");
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      stopStream();
      clearAudioUrl();
    };
  }, []);

  const handleStart = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("error");
      setMessage("Энэ browser дээр микрофоноор бичих боломжгүй байна.");
      return;
    }

    try {
      clearAudioUrl();
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      streamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const fileExtension = mimeType.includes("mp4") ? "m4a" : "webm";
        audioSequenceRef.current += 1;
        const file = new File([blob], `tailan-audio-${audioSequenceRef.current}.${fileExtension}`, { type: mimeType });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        if (inputRef.current) {
          inputRef.current.files = dataTransfer.files;
        }
        const nextUrl = URL.createObjectURL(blob);
        audioUrlRef.current = nextUrl;
        setAudioUrl(nextUrl);
        setDurationLabel(`${Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))} сек`);
        setStatus("ready");
        setMessage("Аудио бичлэг бэлэн боллоо.");
        stopStream();
      };

      mediaRecorder.start();
      setStatus("recording");
      setDurationLabel("");
      setMessage("Бичиж байна. Дуусмагц зогсооно уу.");
    } catch {
      stopStream();
      setStatus("error");
      setMessage("Микрофон ашиглах зөвшөөрөл өгөөд дахин оролдоно уу.");
    }
  };

  const handleStop = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleClear = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    clearAudioUrl();
    setDurationLabel("");
    setStatus("idle");
    setMessage("Файл сонгохгүй, зөвхөн микрофоноор шууд бичнэ.");
  };

  return (
    <div className={styles.audioRecorderField}>
      <div className={styles.reportMediaHeader}>
        <div>
          <strong>Аудио тайлбар</strong>
          <small>Шууд record хийж хавсаргана</small>
        </div>
        <span>{status === "recording" ? "Бичиж байна" : status === "ready" ? "Хавсаргасан" : "Сонгоогүй"}</span>
      </div>

      <input ref={inputRef} name="report_audios" type="file" accept="audio/*" className={styles.hiddenFileInput} />

      <div className={styles.audioRecorderPanel} data-recording={status === "recording" ? "true" : "false"}>
        <span className={styles.audioRecorderIcon} aria-hidden="true">
          <Mic size={22} strokeWidth={2.5} />
        </span>
        <div>
          <strong>{durationLabel || (status === "recording" ? "Бичлэг явж байна" : "Аудио бичлэг")}</strong>
          <small>{message}</small>
        </div>
        {status === "ready" ? (
          <button type="button" className={styles.audioRemoveButton} aria-label="Аудио устгах" onClick={handleClear}>
            <X size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {audioUrl ? <audio className={styles.audioPreview} src={audioUrl} controls /> : null}

      <div className={styles.reportMediaActions}>
        {status === "recording" ? (
          <button type="button" className={styles.mediaStopButton} onClick={handleStop}>
            <Square size={17} strokeWidth={2.5} aria-hidden="true" />
            Зогсоох
          </button>
        ) : status === "ready" ? (
          <button type="button" className={styles.mediaActionButtonPrimary} onClick={handleStart}>
            <RotateCcw size={17} strokeWidth={2.4} aria-hidden="true" />
            Дахин бичих
          </button>
        ) : (
          <button type="button" className={styles.mediaActionButtonPrimary} onClick={handleStart}>
            <Mic size={18} strokeWidth={2.4} aria-hidden="true" />
            Бичлэг эхлүүлэх
          </button>
        )}
        {status === "ready" ? (
          <button type="button" className={styles.mediaActionButton} onClick={handleClear}>
            Устгах
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TaskReportModal({
  action,
  taskId,
  defaultOpen = false,
  quantityOptional = false,
  measurementUnit,
  quantityLines = [],
  variant = "default",
  requireQuantity,
  simpleMobile = false,
  workItemName,
  triggerClassName,
  triggerContent,
}: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);
  const [reportText, setReportText] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const hasMultipleQuantityLines = quantityLines.length > 1;
  const shouldShowQuantity =
    !simpleMobile &&
    !hasMultipleQuantityLines &&
    (requireQuantity ?? (!quantityOptional && Boolean(measurementUnit?.trim())));
  const quantityLabel = `Хийсэн хэмжээ${measurementUnit ? ` (${measurementUnit})` : ""}`;
  const closeModal = () => setIsOpen(false);

  const modalContent =
    mounted && isOpen
      ? createPortal(
          <div className={styles.modalOverlay} role="presentation" onClick={closeModal}>
            <div
              className={styles.modalDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-report-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalMobileChrome}>
                <button type="button" aria-label="Буцах" onClick={closeModal}>
                  <span aria-hidden="true">←</span>
                </button>
                <strong>Гүйцэтгэлийн тайлан</strong>
                <button type="button" aria-label="Хаах" onClick={closeModal}>
                  <X size={20} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.modalHeader}>
                <div className={styles.modalTitleGroup}>
                  <span className={styles.kicker}>Гүйцэтгэлийн тайлан</span>
                  <strong className={styles.actionTitle} id="task-report-modal-title">
                    {simpleMobile ? "Даалгаврын тайлан илгээх" : "Тайлан оруулах"}
                  </strong>
                  {workItemName ? <small className={styles.modalSubtitle}>{workItemName}</small> : null}
                </div>

                <button
                  type="button"
                  className={styles.modalCloseButton}
                  aria-label="Цонх хаах"
                  onClick={closeModal}
                >
                  Хаах
                </button>
              </div>

              <form action={action} className={styles.modalForm}>
                <input type="hidden" name="task_id" value={taskId} />

                <div className={styles.modalBodyGrid}>
                  <section className={styles.modalSectionCard}>
                    <div className={styles.composerHighlight}>
                      <strong>Тайлан</strong>
                    </div>

                    {simpleMobile && workItemName ? (
                      <input type="hidden" name="report_work_item_name" value={workItemName} />
                    ) : null}

                    {hasMultipleQuantityLines && !simpleMobile ? (
                      <div className={styles.reportQuantityLines}>
                        <span className={styles.reportBodyLabel}>Хийсэн хэмжээ</span>
                        {quantityLines.map((line, index) => (
                          <label key={`${line.unit}-${index}`} className={styles.modalField}>
                            <span>
                              {line.unit} · төлөвлөсөн {line.quantity}
                            </span>
                            <input
                              name="reported_quantity_line"
                              type="number"
                              step="0.01"
                              min="0"
                              inputMode="decimal"
                              defaultValue={line.quantity}
                            />
                            <input type="hidden" name="reported_quantity_unit" value={line.unit} />
                          </label>
                        ))}
                      </div>
                    ) : shouldShowQuantity ? (
                      <label htmlFor="reported_quantity" className={styles.modalField}>
                        <span>{quantityLabel}</span>
                        <input
                          id="reported_quantity"
                          name="reported_quantity"
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          placeholder="Заавал биш"
                        />
                      </label>
                    ) : null}

                    <label htmlFor="report_text" className={styles.modalField}>
                      <span>Тайлбар</span>
                      <span className={styles.modalTextareaWrap}>
                        <textarea
                          id="report_text"
                          name="report_text"
                          maxLength={500}
                          value={reportText}
                          onChange={(event) => setReportText(event.target.value)}
                          placeholder={
                            simpleMobile
                              ? "Энэ даалгавар дээр юу хийснээ товч бичнэ үү"
                              : "Юу хийсэн, ямар саад гарсан, дараагийн алхам юу болохыг товч бичнэ үү"
                          }
                          required
                        />
                        <small>{reportText.length}/500</small>
                      </span>
                    </label>
                  </section>

                  <section className={`${styles.modalSectionCard} ${styles.attachmentSectionCard}`}>
                    <div className={styles.modalSectionHeading}>
                      <strong>Хавсралт</strong>
                    </div>

                    <PhotoReportField
                      id="report_before_images"
                      name="report_before_images"
                      label="Өмнөх зураг"
                      maxFiles={5}
                      emptyStateLabel="Өмнөх зураг сонгоогүй байна"
                    />

                    <PhotoReportField
                      id="report_after_images"
                      name="report_after_images"
                      label="Дараах зураг"
                      maxFiles={5}
                      emptyStateLabel="Дараах зураг сонгоогүй байна"
                    />

                    <AudioRecorderField />
                  </section>
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={closeModal}
                  >
                    Болих
                  </button>
                  <button type="submit" className={styles.actionButton}>
                    {simpleMobile ? "Илгээх" : "Тайлан илгээх"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? (variant === "hero" ? styles.heroReportButton : styles.actionButton)}
        onClick={() => setIsOpen(true)}
      >
        {triggerContent ?? (simpleMobile ? "Даалгаврын тайлан илгээх" : "Тайлан оруулах")}
      </button>
      {modalContent}
    </>
  );
}
