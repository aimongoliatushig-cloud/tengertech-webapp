"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { FileText, X } from "lucide-react";

import type { ProcurementAttachment } from "@/lib/procurement";

import styles from "../procurement.module.css";

function attachmentUrl(attachmentId: number) {
  return `/api/odoo/attachments/${attachmentId}`;
}

function isImageAttachment(attachment: ProcurementAttachment) {
  const name = attachment.name.toLowerCase();
  return (
    attachment.mimetype?.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].some((extension) => name.endsWith(extension))
  );
}

export function ProcurementAttachmentPreview({
  attachment,
  title,
  note,
}: {
  attachment: ProcurementAttachment;
  title: string;
  note?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const href = attachmentUrl(attachment.id);
  const isImage = isImageAttachment(attachment);

  return (
    <>
      {isImage ? (
        <button type="button" className={styles.attachmentPreviewCard} onClick={() => setOpen(true)}>
          <img src={href} alt={attachment.name} />
          <span>
            <strong>{title}</strong>
            <small>{attachment.name}</small>
            {note ? <small>{note}</small> : null}
          </span>
        </button>
      ) : (
        <a href={href} target="_blank" rel="noreferrer" className={styles.attachmentPreviewCard}>
          <span className={styles.attachmentFileIcon}><FileText aria-hidden /></span>
          <span>
            <strong>{title}</strong>
            <small>{attachment.name}</small>
            {note ? <small>{note}</small> : null}
          </span>
        </a>
      )}

      {open ? (
        <div className={styles.previewModalOverlay} role="presentation" onClick={() => setOpen(false)}>
          <div className={styles.previewModal} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.previewModalHeader}>
              <div>
                <strong>{title}</strong>
                <small>{attachment.name}</small>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setOpen(false)} aria-label="Хаах">
                <X aria-hidden />
              </button>
            </div>
            <img src={href} alt={attachment.name} />
          </div>
        </div>
      ) : null}
    </>
  );
}
