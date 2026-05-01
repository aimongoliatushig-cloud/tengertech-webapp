"use client";

import { useMemo, useState } from "react";

import styles from "./garbage-settings.module.css";

type RoutePointOption = {
  id: number;
  name: string;
  subdistrictName: string;
};

type RouteCreateFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  points: RoutePointOption[];
};

type RouteEditFormProps = RouteCreateFormProps & {
  route: {
    id: number;
    name: string;
    pointIds: number[];
  };
};

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase("mn-MN").trim();
}

function uniqueIds(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}

function RoutePointForm({
  action,
  points,
  route,
}: RouteCreateFormProps & {
  route?: RouteEditFormProps["route"];
}) {
  const [query, setQuery] = useState("");
  const [selectedPointIds, setSelectedPointIds] = useState<number[]>(() => uniqueIds(route?.pointIds ?? []));
  const isEditMode = Boolean(route);

  const uniquePoints = useMemo(
    () => Array.from(new Map(points.map((point) => [point.id, point])).values()),
    [points],
  );
  const selectedIdSet = useMemo(() => new Set(selectedPointIds), [selectedPointIds]);
  const selectedPoints = useMemo(
    () => selectedPointIds
      .map((pointId) => uniquePoints.find((point) => point.id === pointId))
      .filter((point): point is RoutePointOption => Boolean(point)),
    [selectedPointIds, uniquePoints],
  );
  const filteredPoints = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return uniquePoints;
    }

    return uniquePoints.filter((point) =>
      normalizeSearchText(`${point.subdistrictName} ${point.name}`).includes(normalizedQuery),
    );
  }, [query, uniquePoints]);

  const togglePoint = (pointId: number) => {
    setSelectedPointIds((current) =>
      current.includes(pointId)
        ? current.filter((id) => id !== pointId)
        : [...current, pointId],
    );
  };

  const removePoint = (pointId: number) => {
    setSelectedPointIds((current) => current.filter((id) => id !== pointId));
  };

  return (
    <form action={action} className={`${styles.formPanel} ${styles.routeCreatePanel}`}>
      {route ? <input type="hidden" name="route_id" value={route.id} /> : null}
      {selectedPointIds.map((pointId) => (
        <input key={pointId} type="hidden" name="route_point_ids" value={pointId} />
      ))}

      <div className={styles.formPanelHeader}>
        <div>
          <span className={styles.eyebrow}>{isEditMode ? "Маршрут засах" : "Маршрут нэмэх"}</span>
          <strong>{isEditMode ? "Маршрутын нэр болон цэгүүд" : "Цэгүүдийг нэг маршрут болгон холбох"}</strong>
        </div>
        <span className={styles.countPill}>{selectedPointIds.length} цэг</span>
      </div>

      <div className={styles.routeQuickFields}>
        <label className={styles.field}>
          <span>Маршрутын нэр</span>
          <input
            name="route_name"
            defaultValue={route?.name ?? ""}
            placeholder="Жишээ: 8-р хороо өглөөний маршрут"
            required
          />
        </label>
      </div>

      <fieldset className={styles.memberPicker}>
        <legend>Маршрутын хогийн цэгүүд</legend>
        <div className={styles.memberToolbar}>
          <label className={styles.field}>
            <span>Цэг хайх</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Цэгийн нэр, хороо"
            />
          </label>
          <div className={styles.selectedMembers} aria-live="polite">
            {selectedPoints.length ? (
              selectedPoints.slice(0, 8).map((point) => (
                <button
                  key={point.id}
                  type="button"
                  className={styles.selectedChip}
                  onClick={() => removePoint(point.id)}
                >
                  {point.name}
                  <span aria-hidden>×</span>
                </button>
              ))
            ) : (
              <span className={styles.selectedPlaceholder}>Цэг сонгоогүй</span>
            )}
            {selectedPoints.length > 8 ? (
              <span className={styles.selectedPlaceholder}>+{selectedPoints.length - 8}</span>
            ) : null}
          </div>
        </div>

        {filteredPoints.length ? (
          <div className={styles.pointGrid}>
            {filteredPoints.map((point) => {
              const checked = selectedIdSet.has(point.id);
              return (
                <label key={point.id} className={styles.memberOption}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePoint(point.id)}
                  />
                  <span>
                    <strong>{point.name}</strong>
                    {point.subdistrictName ? <small>{point.subdistrictName}</small> : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyState}>Хайлтад тохирох хогийн цэг алга.</p>
        )}
      </fieldset>

      <button type="submit" className={styles.primaryButton}>
        {isEditMode ? "Өөрчлөлт хадгалах" : "Маршрут нэмэх"}
      </button>
    </form>
  );
}

export function RouteCreateForm(props: RouteCreateFormProps) {
  return <RoutePointForm {...props} />;
}

export function RouteEditForm(props: RouteEditFormProps) {
  return <RoutePointForm {...props} />;
}
