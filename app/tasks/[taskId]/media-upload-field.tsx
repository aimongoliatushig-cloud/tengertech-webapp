"use client";

import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react";

import styles from "./task-detail.module.css";

type Props = {
  id: string;
  name: string;
  label: string;
  accept: string;
  helperText?: string;
  emptyStateLabel: string;
  multiple?: boolean;
  maxFiles?: number;
};

export function MediaUploadField({
  id,
  name,
  label,
  accept,
  helperText,
  emptyStateLabel,
  multiple = false,
  maxFiles,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [limitMessage, setLimitMessage] = useState("");

  const handlePick = () => {
    inputRef.current?.click();
  };

  const handleClear = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setSelectedFiles([]);
    setLimitMessage("");
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const limitedFiles = maxFiles ? files.slice(0, maxFiles) : files;

    if (maxFiles && files.length > maxFiles) {
      const dataTransfer = new DataTransfer();
      limitedFiles.forEach((file) => dataTransfer.items.add(file));
      event.target.files = dataTransfer.files;
      setLimitMessage(`Дээд тал нь ${maxFiles} файл оруулна.`);
    } else {
      setLimitMessage("");
    }

    setSelectedFiles(limitedFiles.map((file) => file.name));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handlePick();
    }
  };

  const statusLabel = selectedFiles.length
    ? `${selectedFiles.length} файл сонгосон`
    : emptyStateLabel;

  return (
    <div className={styles.fileFieldGroup}>
      <div className={styles.filePickerHeader}>
        <div className={styles.filePickerTitleGroup}>
          <label htmlFor={id}>{label}</label>
          {helperText ? <small className={styles.inputHint}>{helperText}</small> : null}
          {maxFiles ? <small className={styles.inputHint}>Дээд тал нь {maxFiles} файл</small> : null}
        </div>
        <span className={styles.filePickerStatus}>{statusLabel}</span>
      </div>

      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        className={styles.hiddenFileInput}
        onChange={handleChange}
      />

      <div
        className={styles.filePickerBox}
        role="button"
        tabIndex={0}
        onClick={handlePick}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.filePickerActions}>
          <button
            type="button"
            className={styles.filePickerButton}
            onClick={(event) => {
              event.stopPropagation();
              handlePick();
            }}
          >
            {label} сонгох
          </button>
          {selectedFiles.length ? (
            <button
              type="button"
              className={styles.filePickerSecondaryButton}
              onClick={(event) => {
                event.stopPropagation();
                handleClear();
              }}
            >
              Цэвэрлэх
            </button>
          ) : null}
        </div>

        {selectedFiles.length ? (
          <div className={styles.fileList}>
            {selectedFiles.map((fileName) => (
              <span key={fileName} className={styles.fileTag}>
                {fileName}
              </span>
            ))}
          </div>
        ) : (
          <p className={styles.fileEmptyState}>{emptyStateLabel}</p>
        )}
        {limitMessage ? <p className={styles.fileLimitMessage}>{limitMessage}</p> : null}
      </div>
    </div>
  );
}
