"use client";

import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react";

import styles from "./task-detail.module.css";

type Props = {
  id: string;
  name: string;
  label: string;
  accept: string;
  helperText: string;
  emptyStateLabel: string;
  multiple?: boolean;
};

export function MediaUploadField({
  id,
  name,
  label,
  accept,
  helperText,
  emptyStateLabel,
  multiple = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const handlePick = () => {
    inputRef.current?.click();
  };

  const handleClear = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setSelectedFiles([]);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []).map((file) => file.name);
    setSelectedFiles(nextFiles);
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
          <small className={styles.inputHint}>{helperText}</small>
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
      </div>
    </div>
  );
}
