"use client";

import { useMemo, useState } from "react";

import styles from "./garbage-settings.module.css";

type Option = {
  id: number;
  label: string;
};

type VehicleOption = Option & {
  inspectorIds?: number[];
};

type PointOption = Option & {
  subdistrictId?: number | null;
};

type Inspector = {
  id: number;
  name: string;
  meta: string;
  subdistrictIds: number[];
  pointIds: number[];
  vehicleIds: number[];
};

type InspectorScopePanelProps = {
  action: (formData: FormData) => void | Promise<void>;
  inspectors: Inspector[];
  subdistricts: Option[];
  points: PointOption[];
  vehicles: VehicleOption[];
};

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase("mn-MN").trim();
}

function ScopeChecklist({
  name,
  options,
  selectedIds,
  emptyLabel,
  onSelectionChange,
}: {
  name: string;
  options: Option[];
  selectedIds: Set<number>;
  emptyLabel: string;
  onSelectionChange?: (selectedIds: Set<number>) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    return normalizedQuery
      ? options.filter((option) => normalizeSearchText(option.label).includes(normalizedQuery))
      : options;
  }, [options, query]);

  const handleOptionChange = (optionId: number, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(optionId);
    } else {
      next.delete(optionId);
    }
    onSelectionChange?.(next);
  };

  return (
    <div className={styles.scopeChecklist}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Хайх"
      />
      <div>
        {filteredOptions.length ? (
          filteredOptions.map((option) => (
            <label key={`${name}-${option.id}`} className={styles.scopeOption}>
              <input
                type="checkbox"
                name={name}
                value={option.id}
                checked={onSelectionChange ? selectedIds.has(option.id) : undefined}
                defaultChecked={onSelectionChange ? undefined : selectedIds.has(option.id)}
                onChange={
                  onSelectionChange
                    ? (event) => handleOptionChange(option.id, event.target.checked)
                    : undefined
                }
              />
              <span>{option.label}</span>
            </label>
          ))
        ) : (
          <p className={styles.emptyState}>{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

export function InspectorScopePanel({
  action,
  inspectors,
  subdistricts,
  points,
  vehicles,
}: InspectorScopePanelProps) {
  const [activeInspectorId, setActiveInspectorId] = useState(inspectors[0]?.id ?? 0);
  const activeInspector = inspectors.find((inspector) => inspector.id === activeInspectorId) ?? inspectors[0] ?? null;

  const selectedSubdistrictIds = useMemo(() => new Set(activeInspector?.subdistrictIds ?? []), [activeInspector]);
  const selectedPointIds = useMemo(() => new Set(activeInspector?.pointIds ?? []), [activeInspector]);
  const selectedVehicleIds = useMemo(() => new Set(activeInspector?.vehicleIds ?? []), [activeInspector]);
  const [subdistrictSelection, setSubdistrictSelection] = useState<{
    inspectorId: number;
    ids: Set<number>;
  }>({
    inspectorId: activeInspector?.id ?? 0,
    ids: selectedSubdistrictIds,
  });
  const [pointSelection, setPointSelection] = useState<{
    inspectorId: number;
    ids: Set<number>;
  }>({
    inspectorId: activeInspector?.id ?? 0,
    ids: selectedPointIds,
  });
  const [vehicleSelection, setVehicleSelection] = useState<{
    inspectorId: number;
    ids: Set<number>;
  }>({
    inspectorId: activeInspector?.id ?? 0,
    ids: selectedVehicleIds,
  });
  const checkedSubdistrictIds =
    subdistrictSelection.inspectorId === activeInspector?.id
      ? subdistrictSelection.ids
      : selectedSubdistrictIds;
  const checkedPointIds =
    pointSelection.inspectorId === activeInspector?.id
      ? pointSelection.ids
      : selectedPointIds;
  const checkedVehicleIds =
    vehicleSelection.inspectorId === activeInspector?.id
      ? vehicleSelection.ids
      : selectedVehicleIds;

  const visiblePoints = useMemo(() => {
    if (!checkedSubdistrictIds.size) {
      return [];
    }
    return points.filter((point) => point.subdistrictId && checkedSubdistrictIds.has(point.subdistrictId));
  }, [checkedSubdistrictIds, points]);
  const visiblePointIds = useMemo(() => new Set(visiblePoints.map((point) => point.id)), [visiblePoints]);
  const checkedVisiblePointIds = useMemo(
    () => new Set(Array.from(checkedPointIds).filter((pointId) => visiblePointIds.has(pointId))),
    [checkedPointIds, visiblePointIds],
  );
  const visibleVehicles = useMemo(() => {
    if (!activeInspector) {
      return [];
    }
    return vehicles.filter((vehicle) => {
      const assignedInspectorIds = vehicle.inspectorIds ?? [];
      return !assignedInspectorIds.length || assignedInspectorIds.includes(activeInspector.id);
    });
  }, [activeInspector, vehicles]);
  const visibleVehicleIds = useMemo(() => new Set(visibleVehicles.map((vehicle) => vehicle.id)), [visibleVehicles]);
  const checkedVisibleVehicleIds = useMemo(
    () => new Set(Array.from(checkedVehicleIds).filter((vehicleId) => visibleVehicleIds.has(vehicleId))),
    [checkedVehicleIds, visibleVehicleIds],
  );

  if (!inspectors.length) {
    return (
      <p className={styles.emptyState}>
        Тээвэрлэлтийн хяналтын ажилтан олдсонгүй. Ажилтны албан тушаал дээр яг энэ нэршлийг тохируулсны дараа энд гарна.
      </p>
    );
  }

  return (
    <div className={styles.inspectorScopeLayout}>
      <aside className={styles.inspectorList}>
        {inspectors.map((inspector) => (
          <button
            key={inspector.id}
            type="button"
            className={inspector.id === activeInspector?.id ? styles.inspectorListActive : ""}
            onClick={() => setActiveInspectorId(inspector.id)}
          >
            <strong>{inspector.name}</strong>
            {inspector.meta ? <small>{inspector.meta}</small> : null}
          </button>
        ))}
      </aside>

      {activeInspector ? (
        <form key={activeInspector.id} action={action} className={styles.inspectorScopeForm}>
          <input type="hidden" name="inspector_employee_id" value={activeInspector.id} />
          <div className={styles.formPanelHeader}>
            <div>
              <span className={styles.eyebrow}>Байцаагчийн хүрээ</span>
              <strong>{activeInspector.name}</strong>
              {activeInspector.meta ? <small>{activeInspector.meta}</small> : null}
            </div>
            <div className={styles.scopeCountGrid} aria-label="Оноосон хяналтын хүрээний тоо">
              <span className={styles.scopeCountPill}>
                <b>{checkedSubdistrictIds.size}</b>
                <small>хороо</small>
              </span>
              <span className={styles.scopeCountPill}>
                <b>{checkedVisiblePointIds.size}</b>
                <small>хогийн цэг</small>
              </span>
              <span className={styles.scopeCountPill}>
                <b>{checkedVisibleVehicleIds.size}</b>
                <small>машин</small>
              </span>
            </div>
          </div>

          <div className={styles.scopeColumns}>
            <section>
              <h3>Хянах хороо</h3>
              <ScopeChecklist
                name="scope_subdistrict_ids"
                options={subdistricts}
                selectedIds={checkedSubdistrictIds}
                emptyLabel="Хороо бүртгэгдээгүй байна."
                onSelectionChange={(nextIds) =>
                  setSubdistrictSelection({
                    inspectorId: activeInspector.id,
                    ids: nextIds,
                  })
                }
              />
            </section>
            <section>
              <h3>Хянах хогийн цэг</h3>
              <ScopeChecklist
                name="scope_point_ids"
                options={visiblePoints}
                selectedIds={checkedVisiblePointIds}
                emptyLabel={
                  checkedSubdistrictIds.size
                    ? "Сонгосон хороонд хогийн цэг бүртгэгдээгүй байна."
                    : "Эхлээд хянах хороогоо сонгоно уу."
                }
                onSelectionChange={(nextIds) =>
                  setPointSelection({
                    inspectorId: activeInspector.id,
                    ids: nextIds,
                  })
                }
              />
            </section>
            <section>
              <h3>Хянах машин</h3>
              <ScopeChecklist
                name="scope_vehicle_ids"
                options={visibleVehicles}
                selectedIds={checkedVisibleVehicleIds}
                emptyLabel="Машин бүртгэгдээгүй байна. Жолооч, ачигчийн мэдээлэл машин дээр хадгалагдана."
                onSelectionChange={(nextIds) =>
                  setVehicleSelection({
                    inspectorId: activeInspector.id,
                    ids: nextIds,
                  })
                }
              />
            </section>
          </div>

          <p className={styles.helperText}>
            Хяналтын ажилтанд зөвхөн хороо, хогийн цэг, машин онооно. Жолооч болон ачигчийн бүрэлдэхүүн тухайн машин дээр хадгалагдсан мэдээллээр дагаж ирнэ.
          </p>

          <button type="submit" className={styles.primaryButton}>Хадгалах</button>
        </form>
      ) : null}
    </div>
  );
}
