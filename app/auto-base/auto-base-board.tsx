"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { updateFleetVehicleAction } from "./actions";

import styles from "./page.module.css";

type FleetVehicleCrewAssignment = {
  teamId: number;
  teamName: string;
  operationType: string;
  driverNames: string[];
  loaderNames: string[];
  memberNames: string[];
};

type FleetVehicleBoardItem = {
  id: number;
  plate: string;
  name: string;
  modelName: string;
  categoryName: string;
  vin: string;
  odometerLabel: string;
  fuelTypeLabel: string;
  fleetDriverName: string;
  stateLabel: string;
  latestRepairState: string;
  isOperational: boolean;
  isRepair: boolean;
  isArchived: boolean;
  crewAssignments: FleetVehicleCrewAssignment[];
};

type FleetVehicleBoard = {
  allVehicles: FleetVehicleBoardItem[];
  activeVehicles: FleetVehicleBoardItem[];
  repairVehicles: FleetVehicleBoardItem[];
  totalVehicles: number;
  activeCount: number;
  repairCount: number;
};

type BucketConfig = {
  key: "all" | "active" | "repair";
  title: string;
  count: number;
  description: string;
  hint: string;
  emptyLabel: string;
  vehicles: FleetVehicleBoardItem[];
  tone: "all" | "active" | "repair";
  inputId: string;
  panelTestId: string;
  cardClassName: string;
  panelClassName: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function meterStyle(count: number, total: number): CSSProperties {
  return {
    "--vehicle-share": total > 0 ? count / total : 0,
  } as CSSProperties;
}

function VehicleList({
  vehicles,
  emptyLabel,
  onSelectVehicle,
}: {
  vehicles: FleetVehicleBoardItem[];
  emptyLabel: string;
  onSelectVehicle: (vehicle: FleetVehicleBoardItem) => void;
}) {
  if (!vehicles.length) {
    return <div className={styles.emptyState}>{emptyLabel}</div>;
  }

  return (
    <div className={styles.vehicleList}>
      {vehicles.map((vehicle) => (
        <button
          key={vehicle.id}
          type="button"
          className={styles.vehicleCard}
          onClick={() => onSelectVehicle(vehicle)}
        >
          <div className={styles.vehicleTop}>
            <strong className={styles.vehiclePlate}>{vehicle.plate}</strong>
            <span
              className={cx(
                styles.vehicleState,
                vehicle.isRepair ? styles.vehicleStateRepair : styles.vehicleStateActive,
              )}
            >
              {vehicle.isRepair
                ? vehicle.latestRepairState || vehicle.stateLabel || "Засварт"
                : vehicle.stateLabel || (vehicle.isOperational ? "Идэвхтэй" : "Бүртгэлтэй")}
            </span>
          </div>
          <p className={styles.vehicleName}>{vehicle.name}</p>
          <span className={styles.vehicleCrewPreview}>
            {vehicle.crewAssignments.length
              ? `${vehicle.crewAssignments.length} баг хуваарилагдсан`
              : "Хуваарилсан баггүй"}
          </span>
        </button>
      ))}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.vehicleDetailItem}>
      <span>{label}</span>
      <strong>{value || "Бүртгээгүй"}</strong>
    </div>
  );
}

function namesLabel(names: string[]) {
  return names.length ? names.join(", ") : "Оноогоогүй";
}

function operationTypeLabel(value: string) {
  const labels: Record<string, string> = {
    garbage: "Хог тээвэр",
    street_cleaning: "Гудамж цэвэрлэгээ",
    green_maintenance: "Ногоон байгууламж",
  };
  return labels[value] ?? value;
}

function VehicleDetailModal({
  vehicle,
  onClose,
}: {
  vehicle: FleetVehicleBoardItem;
  onClose: () => void;
}) {
  return (
    <div className={styles.vehicleModalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={styles.vehicleModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`vehicle-detail-${vehicle.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.vehicleModalHeader}>
          <div>
            <span className={styles.mobileDetailEyebrow}>Машины дэлгэрэнгүй</span>
            <h2 id={`vehicle-detail-${vehicle.id}`}>{vehicle.plate}</h2>
            <p>{vehicle.name}</p>
          </div>
          <button type="button" className={styles.vehicleModalClose} onClick={onClose}>
            Хаах
          </button>
        </div>

        <div className={styles.vehicleDetailGrid}>
          <DetailItem label="Марка / модель" value={vehicle.modelName || vehicle.name} />
          <DetailItem label="Ангилал" value={vehicle.categoryName} />
          <DetailItem label="Төлөв" value={vehicle.stateLabel} />
          <DetailItem label="VIN" value={vehicle.vin} />
          <DetailItem label="Одометр" value={vehicle.odometerLabel} />
          <DetailItem label="Fleet жолооч" value={vehicle.fleetDriverName} />
        </div>

        <section className={styles.vehicleCrewPanel}>
          <div className={styles.vehicleCrewHeader}>
            <span className={styles.mobileDetailEyebrow}>Хуваарилсан хүмүүс</span>
            <strong>{vehicle.crewAssignments.length}</strong>
          </div>
          {vehicle.crewAssignments.length ? (
            <div className={styles.vehicleCrewList}>
              {vehicle.crewAssignments.map((assignment) => (
                <article key={assignment.teamId} className={styles.vehicleCrewCard}>
                  {assignment.operationType ? (
                    <p className={styles.vehicleCrewType}>
                      {operationTypeLabel(assignment.operationType)}
                    </p>
                  ) : null}
                  <div>
                    <span>Баг</span>
                    <strong>{assignment.teamName}</strong>
                  </div>
                  <div>
                    <span>Жолооч</span>
                    <strong>{namesLabel(assignment.driverNames)}</strong>
                  </div>
                  <div>
                    <span>Ачигч</span>
                    <strong>{namesLabel(assignment.loaderNames)}</strong>
                  </div>
                  {assignment.memberNames.length ? (
                    <div>
                      <span>Бусад гишүүд</span>
                      <strong>{namesLabel(assignment.memberNames)}</strong>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.vehicleCrewEmpty}>
              Энэ машин дээр идэвхтэй баг, жолооч, ачигч хуваарилагдаагүй байна.
            </p>
          )}
        </section>

        <form key={vehicle.id} action={updateFleetVehicleAction} className={styles.vehicleEditForm}>
          <input type="hidden" name="vehicle_id" value={vehicle.id} />

          <label className={styles.vehicleFormField}>
            <span>Улсын дугаар</span>
            <input name="license_plate" defaultValue={vehicle.plate} />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Машины нэр</span>
            <input name="name" defaultValue={vehicle.name} />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Засварын төлөв</span>
            <input
              name="latest_repair_state"
              defaultValue={vehicle.latestRepairState}
              placeholder="Жишээ: Засварт, Хүлээгдэж байна"
            />
          </label>

          <label className={styles.vehicleCheckbox}>
            <input
              name="mfo_active_for_ops"
              type="checkbox"
              defaultChecked={vehicle.isOperational}
            />
            <span>Үйл ажиллагаанд идэвхтэй ашиглаж байгаа</span>
          </label>

          <div className={styles.vehicleModalActions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Болих
            </button>
            <button type="submit" className={styles.primaryButton}>
              Хадгалах
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function AutoBaseBoard({
  board,
  initialVehicleId,
  notice,
  error,
}: {
  board: FleetVehicleBoard;
  initialVehicleId?: number | null;
  notice?: string;
  error?: string;
}) {
  const vehiclesById = useMemo(
    () => new Map(board.allVehicles.map((vehicle) => [vehicle.id, vehicle])),
    [board.allVehicles],
  );
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicleBoardItem | null>(
    initialVehicleId ? vehiclesById.get(initialVehicleId) ?? null : null,
  );
  const buckets: BucketConfig[] = [
    {
      key: "all",
      title: "Бүх машин",
      count: board.totalVehicles,
      description: "Авто баазад бүртгэлтэй бүх машины жагсаалт.",
      hint: "Бүгдийг харах",
      emptyLabel: "Одоогоор бүртгэлтэй машин алга.",
      vehicles: board.allVehicles,
      tone: "all",
      inputId: "vehicle-bucket-all",
      panelTestId: "vehicle-bucket-detail-all",
      cardClassName: styles.mobileBucketCardAll,
      panelClassName: styles.mobileDetailAll,
    },
    {
      key: "active",
      title: "Идэвхтэй явж буй машин",
      count: board.activeCount,
      description: "Өнөөдөр ажиллаж байгаа болон рейст гарсан машинууд.",
      hint: "Жагсаалт нээх",
      emptyLabel: "Одоогоор идэвхтэй явж буй машин алга.",
      vehicles: board.activeVehicles,
      tone: "active",
      inputId: "vehicle-bucket-active",
      panelTestId: "vehicle-bucket-detail-active",
      cardClassName: styles.mobileBucketCardActive,
      panelClassName: styles.mobileDetailActive,
    },
    {
      key: "repair",
      title: "Засагдаж буй машин",
      count: board.repairCount,
      description: "Засвар, саатал, техникийн хүлээлттэй машинууд.",
      hint: "Засвар харах",
      emptyLabel: "Одоогоор засагдаж буй машин алга.",
      vehicles: board.repairVehicles,
      tone: "repair",
      inputId: "vehicle-bucket-repair",
      panelTestId: "vehicle-bucket-detail-repair",
      cardClassName: styles.mobileBucketCardRepair,
      panelClassName: styles.mobileDetailRepair,
    },
  ];

  return (
    <>
      {notice || error ? (
        <div
          className={cx(styles.vehicleNotice, error && styles.vehicleNoticeError)}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      ) : null}

      <div className={styles.mobileBoard}>
        <input
          id="vehicle-bucket-all"
          className={styles.mobileBucketInput}
          type="radio"
          name="vehicle-bucket"
          defaultChecked
        />
        <input
          id="vehicle-bucket-active"
          className={styles.mobileBucketInput}
          type="radio"
          name="vehicle-bucket"
        />
        <input
          id="vehicle-bucket-repair"
          className={styles.mobileBucketInput}
          type="radio"
          name="vehicle-bucket"
        />

        <div className={styles.mobileBucketGrid} data-testid="vehicle-bucket-grid">
          {buckets.map((bucket) => (
            <label
              key={bucket.key}
              htmlFor={bucket.inputId}
              data-testid={`vehicle-bucket-${bucket.key}`}
              className={cx(
                styles.mobileBucketCard,
                bucket.tone === "repair"
                  ? styles.mobileBucketRepair
                  : bucket.tone === "all"
                    ? styles.mobileBucketAll
                    : styles.mobileBucketActive,
                bucket.cardClassName,
              )}
              style={meterStyle(bucket.count, board.totalVehicles)}
            >
              <span className={styles.mobileBucketTitle}>{bucket.title}</span>
              <strong className={styles.mobileBucketCount}>{bucket.count}</strong>
              <span className={styles.mobileBucketDescription}>{bucket.description}</span>
              <span className={styles.mobileBucketHint}>{bucket.hint}</span>
              <span className={styles.mobileBucketMeter} aria-hidden>
                <span className={styles.mobileBucketMeterFill} />
              </span>
            </label>
          ))}
        </div>

        <div className={styles.mobilePanels}>
          {buckets.map((bucket) => (
            <section
              key={bucket.key}
              data-testid={bucket.panelTestId}
              className={cx(
                styles.mobileDetailCard,
                styles.mobileDetailPanel,
                bucket.panelClassName,
              )}
            >
              <div className={styles.mobileDetailHeader}>
                <div>
                  <span className={styles.mobileDetailEyebrow}>Сонгосон төлөв</span>
                  <h2>{bucket.title}</h2>
                </div>
                <span className={styles.countBadge}>{bucket.count}</span>
              </div>

              <p className={styles.mobileDetailText}>{bucket.description}</p>

              <VehicleList
                vehicles={bucket.vehicles}
                emptyLabel={bucket.emptyLabel}
                onSelectVehicle={setSelectedVehicle}
              />
            </section>
          ))}
        </div>
      </div>

      <div className={styles.boardGrid} data-testid="vehicle-board-desktop">
        {buckets.map((bucket) => (
          <section
            key={bucket.key}
            className={cx(
              styles.columnCard,
              bucket.tone === "repair"
                ? styles.columnRepair
                : bucket.tone === "all"
                  ? styles.columnAll
                  : styles.columnActive,
            )}
          >
            <div className={styles.columnHeader}>
              <div>
                <span className={styles.columnLabel}>{bucket.title}</span>
                <strong>{bucket.count}</strong>
              </div>
              <span className={styles.countBadge}>{bucket.count}</span>
            </div>

            <VehicleList
              vehicles={bucket.vehicles}
              emptyLabel={bucket.emptyLabel}
              onSelectVehicle={setSelectedVehicle}
            />
          </section>
        ))}
      </div>

      {selectedVehicle ? (
        <VehicleDetailModal
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
        />
      ) : null}
    </>
  );
}
