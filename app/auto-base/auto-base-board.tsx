import type { CSSProperties } from "react";

import styles from "./page.module.css";

type FleetVehicleBoardItem = {
  id: number;
  plate: string;
  name: string;
  stateLabel: string;
  latestRepairState: string;
  isRepair: boolean;
};

type FleetVehicleBoard = {
  activeVehicles: FleetVehicleBoardItem[];
  repairVehicles: FleetVehicleBoardItem[];
  totalVehicles: number;
  activeCount: number;
  repairCount: number;
};

type BucketConfig = {
  key: "active" | "repair";
  title: string;
  count: number;
  description: string;
  hint: string;
  emptyLabel: string;
  vehicles: FleetVehicleBoardItem[];
  repair: boolean;
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
  repair,
}: {
  vehicles: FleetVehicleBoardItem[];
  emptyLabel: string;
  repair: boolean;
}) {
  if (!vehicles.length) {
    return <div className={styles.emptyState}>{emptyLabel}</div>;
  }

  return (
    <div className={styles.vehicleList}>
      {vehicles.map((vehicle) => (
        <article key={vehicle.id} className={styles.vehicleCard}>
          <div className={styles.vehicleTop}>
            <strong className={styles.vehiclePlate}>{vehicle.plate}</strong>
            <span
              className={cx(
                styles.vehicleState,
                repair ? styles.vehicleStateRepair : styles.vehicleStateActive,
              )}
            >
              {repair
                ? vehicle.latestRepairState || vehicle.stateLabel || "Засварт"
                : vehicle.stateLabel || "Идэвхтэй"}
            </span>
          </div>
          <p className={styles.vehicleName}>{vehicle.name}</p>
        </article>
      ))}
    </div>
  );
}

export function AutoBaseBoard({ board }: { board: FleetVehicleBoard }) {
  const buckets: BucketConfig[] = [
    {
      key: "active",
      title: "Идэвхтэй явж буй машин",
      count: board.activeCount,
      description: "Өнөөдөр ажиллаж байгаа болон рейст гарсан машинууд.",
      hint: "Жагсаалт нээх",
      emptyLabel: "Одоогоор идэвхтэй явж буй машин алга.",
      vehicles: board.activeVehicles,
      repair: false,
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
      repair: true,
      inputId: "vehicle-bucket-repair",
      panelTestId: "vehicle-bucket-detail-repair",
      cardClassName: styles.mobileBucketCardRepair,
      panelClassName: styles.mobileDetailRepair,
    },
  ];

  return (
    <>
      <div className={styles.mobileBoard}>
        <input
          id="vehicle-bucket-active"
          className={styles.mobileBucketInput}
          type="radio"
          name="vehicle-bucket"
          defaultChecked
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
                bucket.repair ? styles.mobileBucketRepair : styles.mobileBucketActive,
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
                repair={bucket.repair}
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
              bucket.repair ? styles.columnRepair : styles.columnActive,
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
              repair={bucket.repair}
            />
          </section>
        ))}
      </div>
    </>
  );
}
