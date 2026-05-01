"use client";

import { useMemo, useState } from "react";

import styles from "./garbage-settings.module.css";

type PointRecord = {
  id: number;
  name: string;
  address: string;
  subdistrictId: number | null;
  subdistrictName: string;
};

type SubdistrictRecord = {
  id: number;
  label: string;
};

type PointAction = (formData: FormData) => void | Promise<void>;

type PointManagementPanelProps = {
  createAction: PointAction;
  updateAction: PointAction;
  archiveAction: PointAction;
  points: PointRecord[];
  subdistricts: SubdistrictRecord[];
};

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase("mn-MN").trim();
}

export function PointManagementPanel({
  createAction,
  updateAction,
  archiveAction,
  points,
  subdistricts,
}: PointManagementPanelProps) {
  const [activeSubdistrictId, setActiveSubdistrictId] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const uniquePoints = useMemo(
    () => Array.from(new Map(points.map((point) => [point.id, point])).values()),
    [points],
  );
  const uniqueSubdistricts = useMemo(
    () => Array.from(new Map(subdistricts.map((subdistrict) => [subdistrict.id, subdistrict])).values()),
    [subdistricts],
  );

  const pointCountsBySubdistrict = useMemo(() => {
    const counts = new Map<number, number>();
    for (const point of uniquePoints) {
      if (!point.subdistrictId) {
        continue;
      }
      counts.set(point.subdistrictId, (counts.get(point.subdistrictId) ?? 0) + 1);
    }
    return counts;
  }, [uniquePoints]);

  const visibleSubdistricts = useMemo(
    () => uniqueSubdistricts.filter((subdistrict) => pointCountsBySubdistrict.has(subdistrict.id)),
    [pointCountsBySubdistrict, uniqueSubdistricts],
  );

  const filteredPoints = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    return uniquePoints.filter((point) => {
      const matchesSubdistrict =
        activeSubdistrictId === "all" || point.subdistrictId === activeSubdistrictId;
      const matchesQuery =
        !normalizedQuery ||
        normalizeSearchText(`${point.name} ${point.subdistrictName}`).includes(normalizedQuery);
      return matchesSubdistrict && matchesQuery;
    });
  }, [activeSubdistrictId, query, uniquePoints]);

  const activeSubdistrictLabel =
    activeSubdistrictId === "all"
      ? "Бүх хороо"
      : uniqueSubdistricts.find((subdistrict) => subdistrict.id === activeSubdistrictId)?.label ?? "Хороо";

  return (
    <div className={styles.pointLayout}>
      <form action={createAction} className={styles.formPanel}>
        <span className={styles.eyebrow}>Хогийн цэг нэмэх</span>
        <label className={styles.field}>
          <span>Цэгийн нэр</span>
          <input name="point_name" placeholder="Жишээ: 8-р хороо 20-р цэг" required />
        </label>
        <label className={styles.field}>
          <span>Хороо</span>
          <select name="subdistrict_id" required defaultValue="">
            <option value="" disabled>Хороо сонгох</option>
            {uniqueSubdistricts.map((subdistrict) => (
              <option key={`create-subdistrict-${subdistrict.id}`} value={subdistrict.id}>{subdistrict.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={styles.primaryButton}>Хогийн цэг нэмэх</button>
      </form>

      <div className={styles.pointManager}>
        <div className={styles.pointTools}>
          <div className={styles.pointTabs} role="tablist" aria-label="Хогийн цэгийг хороогоор шүүх">
            <button
              type="button"
              role="tab"
              className={`${styles.pointTab} ${activeSubdistrictId === "all" ? styles.pointTabActive : ""}`}
              aria-selected={activeSubdistrictId === "all"}
              onClick={() => setActiveSubdistrictId("all")}
            >
              Бүгд
              <span>{uniquePoints.length}</span>
            </button>
            {visibleSubdistricts.map((subdistrict) => (
              <button
                key={`point-tab-${subdistrict.id}`}
                type="button"
                role="tab"
                className={`${styles.pointTab} ${activeSubdistrictId === subdistrict.id ? styles.pointTabActive : ""}`}
                aria-selected={activeSubdistrictId === subdistrict.id}
                onClick={() => setActiveSubdistrictId(subdistrict.id)}
              >
                {subdistrict.label}
                <span>{pointCountsBySubdistrict.get(subdistrict.id) ?? 0}</span>
              </button>
            ))}
          </div>

          <label className={`${styles.field} ${styles.pointSearch}`}>
            <span>Цэг хайх</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Цэгийн нэр, хороо"
            />
          </label>
        </div>

        <div className={styles.pointListHeader}>
          <div>
            <h3>{activeSubdistrictLabel}</h3>
            <small>{filteredPoints.length} цэг харагдаж байна</small>
          </div>
          <span className={styles.countPill}>{filteredPoints.length} цэг</span>
        </div>

        {filteredPoints.length ? (
          <div className={styles.pointCards}>
            {filteredPoints.map((point, pointIndex) => (
              <article key={`point-card-${point.id}-${pointIndex}`} className={styles.pointCard}>
                <div className={styles.pointCardHeader}>
                  <div>
                    <strong>{point.name}</strong>
                    <small>{point.subdistrictName || "Хороо сонгоогүй"}</small>
                  </div>
                  <form action={archiveAction} className={styles.pointArchiveForm}>
                    <input type="hidden" name="point_id" value={point.id} />
                    <button type="submit" className={styles.ghostDanger}>Устгах</button>
                  </form>
                </div>

                <details className={styles.pointEditDetails}>
                  <summary>Засах</summary>
                  <form action={updateAction} className={styles.pointEditForm}>
                    <input type="hidden" name="point_id" value={point.id} />
                    <label className={styles.field}>
                      <span>Цэгийн нэр</span>
                      <input name="point_name" defaultValue={point.name} required />
                    </label>
                    <label className={styles.field}>
                      <span>Хороо</span>
                      <select name="subdistrict_id" defaultValue={point.subdistrictId ?? ""} required>
                        <option value="" disabled>Хороо сонгох</option>
                        {uniqueSubdistricts.map((subdistrict) => (
                          <option key={`edit-${point.id}-subdistrict-${subdistrict.id}`} value={subdistrict.id}>{subdistrict.label}</option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className={styles.primaryButton}>Өөрчлөлт хадгалах</button>
                  </form>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>Энэ шүүлтэд тохирох хогийн цэг алга.</p>
        )}
      </div>
    </div>
  );
}
