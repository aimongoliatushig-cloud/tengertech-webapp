"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./report-image-lightbox.module.css";

export type ReportLightboxImage = {
  id: number | string;
  url: string;
  name: string;
  alt?: string;
  caption?: string;
};

type Props = {
  images: ReportLightboxImage[];
  gridClassName?: string;
  triggerClassName?: string;
  imageClassName?: string;
  captionClassName?: string;
  imageWidth?: number;
  imageHeight?: number;
  showCaption?: boolean;
  viewerTitle?: string;
};

export function ReportImageLightbox({
  images,
  gridClassName,
  triggerClassName,
  imageClassName,
  captionClassName,
  imageWidth = 320,
  imageHeight = 240,
  showCaption = false,
  viewerTitle = "Тайлангийн зураг",
}: Props) {
  const [activeImage, setActiveImage] = useState<ReportLightboxImage | null>(null);
  const activeTitle = activeImage?.caption || viewerTitle;

  useEffect(() => {
    if (!activeImage) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveImage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [activeImage]);

  return (
    <>
      <div className={gridClassName}>
        {images.map((image) => (
          <button
            key={image.id}
            type="button"
            className={`${styles.trigger}${triggerClassName ? ` ${triggerClassName}` : ""}`}
            onClick={() => setActiveImage(image)}
            aria-label={`${image.caption || viewerTitle} томоор харах`}
          >
            <Image
              src={image.url}
              alt={image.alt || image.caption || viewerTitle}
              className={imageClassName}
              width={imageWidth}
              height={imageHeight}
              unoptimized
            />
            {showCaption && image.caption ? <span className={captionClassName}>{image.caption}</span> : null}
          </button>
        ))}
      </div>

      {activeImage && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.overlay} role="presentation" onClick={() => setActiveImage(null)}>
              <div
                className={styles.viewer}
                role="dialog"
                aria-modal="true"
                aria-label={activeTitle}
                onClick={(event) => event.stopPropagation()}
              >
                <header className={styles.header}>
                  <button type="button" className={styles.backButton} onClick={() => setActiveImage(null)} aria-label="Зураг хаах">
                    <X size={22} strokeWidth={2.4} aria-hidden="true" />
                    Хаах
                  </button>
                  <strong>{activeTitle}</strong>
                </header>
                <div className={styles.imageStage}>
                  <Image
                    src={activeImage.url}
                    alt={activeImage.alt || activeImage.caption || viewerTitle}
                    width={1600}
                    height={1200}
                    unoptimized
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
