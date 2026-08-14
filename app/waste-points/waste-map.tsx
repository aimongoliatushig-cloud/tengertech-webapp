"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Eye, MapPin, Plus, X } from "lucide-react";
import "leaflet/dist/leaflet.css";

import {
  WASTE_STATUS_LABELS,
  WASTE_TASK_TYPES,
  WASTE_TYPE_LABELS,
  formatGps,
  type WastePoint,
  type WastePointType,
} from "@/lib/waste-points/types";

import { createWastePointTaskAction } from "./actions";
import { toQrSrc } from "./qr-viewer";
import styles from "./waste-points.module.css";

const TYPE_COLOR: Record<WastePointType, string> = {
  collection_point: "#2563eb",
  container: "#16a34a",
  illegal_dump: "#dc2626",
};

// Хан-Уул дүүргийн төв орчим
const DEFAULT_CENTER: [number, number] = [47.88, 106.86];

export function WasteMap({ points, initialPointId = "" }: { points: WastePoint[]; initialPointId?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const initialPoint = points.find((point) => String(point.id) === initialPointId) ?? null;
  const [selected, setSelected] = useState<WastePoint | null>(initialPoint);
  const [ready, setReady] = useState(false);
  const [typeFilter, setTypeFilter] = useState<WastePointType | "all">("all");

  const visible = useMemo(
    () => (typeFilter === "all" ? points : points.filter((p) => p.type === typeFilter)),
    [points, typeFilter],
  );

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // Leaflet-ийг зөвхөн browser дээр ачаална (SSR-д орохгүй).
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 12,
        scrollWheelZoom: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);
      cleanup = () => {
        layer.clearLayers();
        map.remove();
        mapRef.current = null;
      };
      setReady(true);
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // Marker-уудыг шүүлт өөрчлөгдөх бүрд дахин зурна.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let cancelled = false;
    let markers: unknown[] = [];

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled) return;
      const map = mapRef.current as import("leaflet").Map;

      markers = visible.map((point) => {
        const color = TYPE_COLOR[point.type];
        const icon = L.divIcon({
          className: "",
          html:
            `<span style="display:block;width:16px;height:16px;border-radius:50%;` +
            `background:${color};border:2px solid #fff;box-shadow:0 0 0 1px ${color},0 1px 3px rgba(0,0,0,.4)"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const marker = L.marker([point.latitude, point.longitude], {
          icon,
          title: `${point.code} · ${point.name}`,
        });
        marker.on("click", () => setSelected(point));
        marker.addTo(map);
        return marker;
      });

      if (visible.length) {
        const focusedPoint = initialPointId ? visible.find((point) => String(point.id) === initialPointId) : null;
        if (focusedPoint) {
          map.setView([focusedPoint.latitude, focusedPoint.longitude], 18);
        } else {
          const bounds = L.latLngBounds(visible.map((p) => [p.latitude, p.longitude] as [number, number]));
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const m of markers) {
        (m as import("leaflet").Marker).remove();
      }
    };
  }, [initialPointId, ready, visible]);

  return (
    <div className={styles.mapWrap}>
      <div className={styles.mapToolbar}>
        <div className={styles.mapLegend}>
          {(Object.keys(TYPE_COLOR) as WastePointType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.legendItem} ${typeFilter === t ? styles.legendItemActive : ""}`}
              onClick={() => setTypeFilter((current) => (current === t ? "all" : t))}
            >
              <span className={styles.legendDot} style={{ background: TYPE_COLOR[t] }} />
              {WASTE_TYPE_LABELS[t]}
              <b>{points.filter((p) => p.type === t).length}</b>
            </button>
          ))}
          {typeFilter !== "all" ? (
            <button type="button" className={styles.legendItem} onClick={() => setTypeFilter("all")}>
              <X size={13} aria-hidden /> Шүүлт цуцлах
            </button>
          ) : null}
        </div>
        <span className={styles.paginationInfo}>{visible.length} цэг харуулж байна</span>
      </div>

      <div className={styles.mapLayout}>
        <div ref={containerRef} className={styles.mapCanvas} />

        {selected ? (
          <aside className={styles.mapPanel}>
            <div className={styles.cardHead}>
              <h2>{selected.name}</h2>
              <button
                type="button"
                className={styles.iconLink}
                onClick={() => setSelected(null)}
                aria-label="Хаах"
              >
                <X size={15} aria-hidden />
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/^https?:\/\//i.test(selected.qrCode) ? (
              <a className={`${styles.button} ${styles.buttonPrimary}`} href={selected.qrCode} target="_blank" rel="noreferrer">Smart Clean QR нээх</a>
            ) : selected.qrCode ? (
              <img className={styles.qrImage} src={toQrSrc(selected.qrCode)} alt={`${selected.code} QR`} />
            ) : null}

            <div className={styles.defList}>
              <div className={styles.defItem}>
                <span>Код</span>
                <strong className={styles.mono}>{selected.code}</strong>
              </div>
              <div className={styles.defItem}>
                <span>Төрөл</span>
                <strong>{WASTE_TYPE_LABELS[selected.type]}</strong>
              </div>
              <div className={styles.defItem}>
                <span>GPS</span>
                <strong className={styles.mono}>{formatGps(selected.latitude, selected.longitude)}</strong>
              </div>
              <div className={styles.defItem}>
                <span>Хаяг</span>
                <strong>{selected.address}</strong>
              </div>
              <div className={styles.defItem}>
                <span>Төлөв</span>
                <strong>
                  {WASTE_STATUS_LABELS[selected.currentStatus]} · {selected.currentFillLevel}%
                </strong>
              </div>
            </div>

            <form action={createWastePointTaskAction} className={styles.taskForm}>
              <input type="hidden" name="point_id" value={selected.id} />
              <label className={styles.field}>
                <span>Ажлын төрөл</span>
                <select name="task_type" defaultValue="collection">
                  {WASTE_TASK_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
                <Plus size={15} aria-hidden /> Ажил үүсгэх
              </button>
            </form>

            <Link href={`/waste-points/${selected.id}`} className={styles.button}>
              <Eye size={15} aria-hidden /> Дэлгэрэнгүй
            </Link>
          </aside>
        ) : (
          <aside className={`${styles.mapPanel} ${styles.mapPanelEmpty}`}>
            <MapPin size={26} aria-hidden />
            <p>Цэг дээр дарж дэлгэрэнгүй мэдээлэл, QR болон ажил үүсгэх хэсгийг нээнэ.</p>
          </aside>
        )}
      </div>
    </div>
  );
}
