"use client";

import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarCheck2,
  Car,
  CheckCircle2,
  ChevronDown,
  Grid3X3,
  List,
  MoreHorizontal,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Truck,
  UploadCloud,
  User,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  archiveFleetVehicleAction,
  createFleetVehicleAction,
  updateFleetVehicleAction,
} from "./actions";

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
  imageUrl: string;
  modelId: number | null;
  modelName: string;
  categoryId: number | null;
  categoryName: string;
  vehicleTypeId: number | null;
  vehicleTypeName: string;
  departmentId: number | null;
  departmentName: string;
  vin: string;
  odometerValue: string;
  odometerLabel: string;
  fuelTypeKey: string;
  fuelTypeLabel: string;
  capacity: string;
  importedDate: string;
  importedDateValue: string;
  color: string;
  manufacturedDate: string;
  manufacturedDateValue: string;
  seatCountValue: string;
  seatCountLabel: string;
  fleetDriverName: string;
  responsibleDriverId: number | null;
  responsibleDriverName: string;
  loader1Id: number | null;
  loader1Name: string;
  loader2Id: number | null;
  loader2Name: string;
  stateLabel: string;
  operationalStatusKey: string;
  latestRepairState: string;
  isOperational: boolean;
  isRepair: boolean;
  isArchived: boolean;
  insurance: FleetVehicleDeadlineInfo;
  inspection: FleetVehicleDeadlineInfo;
  photoGroups: FleetVehicleAttachmentGroup[];
  documentGroups: FleetVehicleAttachmentGroup[];
  driverHistory: FleetVehicleDriverHistoryItem[];
  repairHistory: FleetVehicleRepairHistoryItem[];
  weightReports: FleetVehicleDailyWeightItem[];
  fuelReports: FleetVehicleDailyFuelItem[];
  procurementLinks: FleetVehicleProcurementLink[];
  crewAssignments: FleetVehicleCrewAssignment[];
};

type FleetVehicleDriverOption = {
  id: number;
  name: string;
  active: boolean;
  departmentName: string;
  jobTitle: string;
};

type FleetVehicleDepartmentOption = {
  id: number;
  name: string;
};

type FleetVehicleSelectOption = {
  id: number;
  name: string;
};

type FleetVehicleDeadlineInfo = {
  company?: string;
  policyNumber?: string;
  startDate?: string;
  endDate?: string;
  startDateValue?: string;
  endDateValue?: string;
  daysRemaining: number;
  reminderDue: boolean;
  note?: string;
  attachmentCount: number;
  attachmentIds: number[];
  contractAttachmentCount?: number;
  contractAttachmentIds?: number[];
};

type FleetVehicleAttachmentGroup = {
  key: string;
  label: string;
  ids: number[];
};

type FleetVehicleDriverHistoryItem = {
  id: number;
  driverName: string;
  dateStart: string;
  dateEnd: string;
  changedBy: string;
  changedDate: string;
};

type FleetVehicleRepairHistoryItem = {
  id: number;
  name: string;
  requestDate: string;
  dateRange: string;
  damageType: string;
  description: string;
  partsNote: string;
  repairNote: string;
  amountLabel: string;
  mechanicName: string;
  stateKey: string;
  stateLabel: string;
  procurementName: string;
  attachmentCount: number;
};

type FleetVehicleDailyWeightItem = {
  id: number;
  reportDate: string;
  reportDateValue?: string;
  weightLabel: string;
  source: string;
  fetchedAt: string;
  fetchedAtValue?: string;
  stateLabel: string;
  errorMessage: string;
};

type FleetVehicleDailyFuelItem = {
  id: number;
  reportDate: string;
  reportDateValue?: string;
  fuelLiters: number;
  fuelLabel: string;
  fuelType: string;
  source: string;
  fetchedAt: string;
  fetchedAtValue?: string;
  stateLabel: string;
  errorMessage: string;
};

type FleetVehicleProcurementLink = {
  id: number;
  name: string;
  repairName: string;
  amountLabel: string;
  stateLabel: string;
};

type FleetVehicleBoard = {
  allVehicles: FleetVehicleBoardItem[];
  activeVehicles: FleetVehicleBoardItem[];
  repairVehicles: FleetVehicleBoardItem[];
  driverOptions: FleetVehicleDriverOption[];
  loaderOptions: FleetVehicleDriverOption[];
  departmentOptions: FleetVehicleDepartmentOption[];
  modelOptions: FleetVehicleSelectOption[];
  vehicleTypeOptions: FleetVehicleSelectOption[];
  categoryOptions: FleetVehicleSelectOption[];
  totalVehicles: number;
  activeCount: number;
  repairCount: number;
  insuranceDueCount: number;
  inspectionDueCount: number;
  todayWeightLabel: string;
  todayFuelLabel: string;
  highestFuelVehicle: string;
  mostRepairedVehicle: string;
  failedImportCount: number;
};

type VehicleFilterKey = "all" | "active" | "repair" | "insurance" | "inspection" | "inactive";
type VehicleStatusFilter = "all" | "active" | "warning" | "repair" | "inactive";
type VehicleViewMode = "grid" | "list";
type VehicleSortMode = "status" | "plate" | "deadline";
type VehicleCategoryFilter = {
  key: string;
  id: number | null;
  name: string;
  count: number;
};

type BucketConfig = {
  key: VehicleFilterKey;
  title: string;
  count: number;
  description: string;
  hint: string;
  emptyLabel: string;
  vehicles: FleetVehicleBoardItem[];
  tone: "active" | "repair" | "warning" | "danger";
};

type VehicleStatusMeta = {
  label: string;
  tone: "active" | "warning" | "repair" | "inactive";
};

type SummaryStat = {
  key: VehicleFilterKey;
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
  tone: "default" | "active" | "repair" | "warning" | "danger";
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const ALL_CATEGORY_KEY = "all";
const UNCATEGORIZED_CATEGORY_KEY = "uncategorized";
const ALL_DEPARTMENT_KEY = "all";
const UNCATEGORIZED_DEPARTMENT_KEY = "uncategorized";
const AUTO_BASE_QUERY_PARAMS = {
  bucket: "fleetBucket",
  category: "fleetType",
  department: "fleetDept",
  search: "fleetQ",
  sort: "fleetSort",
  status: "fleetStatus",
  vehicle: "vehicle",
  view: "fleetView",
} as const;
const ACTIVE_REPAIR_STATE_KEYS = new Set([
  "new",
  "diagnosed",
  "waiting_parts",
  "waiting_approval",
  "approved",
  "in_repair",
]);
const PREFERRED_CATEGORY_NAMES = ["Хогны машин", "Усалгаа", "Өргөгч", "Ковш"];

function searchParamValue(searchParams: ReturnType<typeof useSearchParams>, key: string) {
  return searchParams?.get(key)?.trim() ?? "";
}

function vehicleIdFromParam(value: string) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

function isVehicleFilterKey(value: string): value is VehicleFilterKey {
  return ["all", "active", "repair", "insurance", "inspection", "inactive"].includes(value);
}

function isVehicleStatusFilter(value: string): value is VehicleStatusFilter {
  return ["all", "active", "warning", "repair", "inactive"].includes(value);
}

function isVehicleViewMode(value: string): value is VehicleViewMode {
  return value === "grid" || value === "list";
}

function isVehicleSortMode(value: string): value is VehicleSortMode {
  return value === "status" || value === "plate" || value === "deadline";
}

function setQueryParam(params: URLSearchParams, key: string, value: string, defaultValue = "") {
  if (!value || value === defaultValue) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}

function normalizeCategoryName(value: string) {
  return value.trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

function normalizeVehicleCategoryDisplayName(value: string) {
  const normalized = normalizeCategoryName(value);
  if (
    normalized === normalizeCategoryName("Хог ачилт") ||
    normalized === normalizeCategoryName("Хог ачит")
  ) {
    return "Хогны машин";
  }

  return value.trim();
}

function isHiddenVehicleCategoryName(value: string) {
  const normalized = normalizeCategoryName(value);
  return (
    normalized.startsWith("smoke type") ||
    normalized.includes("шалгах төрөл") ||
    normalized.includes("туршилтын төрөл")
  );
}

function vehicleCategoryName(
  vehicle: Pick<FleetVehicleBoardItem, "vehicleTypeName" | "categoryName">,
) {
  return normalizeVehicleCategoryDisplayName(vehicle.vehicleTypeName || vehicle.categoryName);
}

function vehicleCategoryKey(
  vehicle: Pick<
    FleetVehicleBoardItem,
    "vehicleTypeId" | "vehicleTypeName" | "categoryId" | "categoryName"
  >,
) {
  const normalizedTypeName = normalizeCategoryName(
    normalizeVehicleCategoryDisplayName(vehicle.vehicleTypeName),
  );
  if (normalizedTypeName) {
    return `type-name:${normalizedTypeName}`;
  }
  const normalizedName = normalizeCategoryName(
    normalizeVehicleCategoryDisplayName(vehicle.categoryName),
  );
  return normalizedName ? `category-name:${normalizedName}` : UNCATEGORIZED_CATEGORY_KEY;
}

function categoryOptionKey(option: FleetVehicleSelectOption, _source: "type" | "category") {
  return `type-name:${normalizeCategoryName(normalizeVehicleCategoryDisplayName(option.name))}`;
}

function normalizeDepartmentName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("mn-MN");
}

function vehicleDepartmentKey(
  vehicle: Pick<FleetVehicleBoardItem, "departmentId" | "departmentName">,
) {
  const normalizedName = normalizeDepartmentName(vehicle.departmentName);
  if (normalizedName) {
    return `department-name:${normalizedName}`;
  }

  return vehicle.departmentId ? `department-id:${vehicle.departmentId}` : UNCATEGORIZED_DEPARTMENT_KEY;
}

function departmentOptionKey(option: FleetVehicleDepartmentOption) {
  const normalizedName = normalizeDepartmentName(option.name);
  return normalizedName ? `department-name:${normalizedName}` : `department-id:${option.id}`;
}

function preferredCategoryRank(name: string) {
  const normalizedName = normalizeCategoryName(name);
  const index = PREFERRED_CATEGORY_NAMES.findIndex(
    (preferredName) => normalizeCategoryName(preferredName) === normalizedName,
  );
  return index === -1 ? PREFERRED_CATEGORY_NAMES.length + 1 : index;
}

function vehicleStatusMeta(vehicle: FleetVehicleBoardItem): VehicleStatusMeta {
  if (vehicle.isRepair) {
    return {
      label: "Засвартай",
      tone: "repair",
    };
  }

  if (!vehicle.isOperational || vehicle.isArchived) {
    return {
      label: vehicle.stateLabel || "Идэвхгүй",
      tone: "inactive",
    };
  }

  if (vehicle.insurance.reminderDue || vehicle.inspection.reminderDue) {
    return {
      label: "Сануулгатай",
      tone: "warning",
    };
  }

  return {
    label: vehicle.stateLabel || "Ажиллаж байна",
    tone: "active",
  };
}

function activeRepairForVehicle(vehicle: FleetVehicleBoardItem) {
  return (
    vehicle.repairHistory.find((item) => ACTIVE_REPAIR_STATE_KEYS.has(item.stateKey)) ??
    (vehicle.isRepair ? vehicle.repairHistory[0] ?? null : null)
  );
}

function vehicleMatchesStatus(vehicle: FleetVehicleBoardItem, status: VehicleStatusFilter) {
  if (status === "all") {
    return true;
  }
  return vehicleStatusMeta(vehicle).tone === status;
}

function vehicleSearchText(vehicle: FleetVehicleBoardItem) {
  return [
    vehicle.plate,
    vehicle.name,
    vehicle.modelName,
    vehicle.categoryName,
    vehicle.vehicleTypeName,
    vehicle.responsibleDriverName,
    vehicle.loader1Name,
    vehicle.loader2Name,
    vehicle.departmentName,
  ]
    .join(" ")
    .toLocaleLowerCase("mn-MN");
}

function shortDeadlineLabel(info: FleetVehicleDeadlineInfo) {
  return info.endDate || "Бүртгээгүй";
}

function percentLabel(value: number, total: number) {
  if (!total) {
    return "0%";
  }

  return `${((value / total) * 100).toFixed(1)}%`;
}

function earliestDeadlineDays(vehicle: FleetVehicleBoardItem) {
  return Math.min(
    vehicle.insurance.daysRemaining >= 0 ? vehicle.insurance.daysRemaining : Number.POSITIVE_INFINITY,
    vehicle.inspection.daysRemaining >= 0 ? vehicle.inspection.daysRemaining : Number.POSITIVE_INFINITY,
  );
}

function statusSortRank(vehicle: FleetVehicleBoardItem) {
  const tone = vehicleStatusMeta(vehicle).tone;
  if (tone === "repair") return 0;
  if (tone === "warning") return 1;
  if (tone === "active") return 2;
  return 3;
}

function primaryVehicleImageUrl(vehicle: FleetVehicleBoardItem) {
  const frontPhotoId = vehicle.photoGroups.find((group) => group.key === "front")?.ids[0];
  return frontPhotoId ? attachmentUrl(frontPhotoId) : vehicle.imageUrl;
}

function VehicleThumbnail({ vehicle }: { vehicle: FleetVehicleBoardItem }) {
  const [failedUrl, setFailedUrl] = useState("");
  const imageUrl = primaryVehicleImageUrl(vehicle);
  const failed = Boolean(imageUrl && failedUrl === imageUrl);

  if (!imageUrl || failed) {
    return (
      <span className={styles.vehicleThumbPlaceholder} aria-hidden>
        <Truck size={58} strokeWidth={1.7} />
      </span>
    );
  }

  return (
    <Image
      className={styles.vehicleThumb}
      src={imageUrl}
      alt=""
      width={320}
      height={180}
      unoptimized
      onError={() => setFailedUrl(imageUrl)}
    />
  );
}

function attachmentUrl(id: number) {
  return `/api/odoo/attachments/${id}`;
}

function AttachmentTile({
  id,
  label,
  previewImages,
  onOpen,
  isSelected = false,
}: {
  id: number;
  label: string;
  previewImages: boolean;
  onOpen: (attachment: { id: number; label: string; url: string }) => void;
  isSelected?: boolean;
}) {
  const [failedId, setFailedId] = useState<number | null>(null);
  const failed = failedId === id;
  const url = attachmentUrl(id);

  if (previewImages && !failed) {
    return (
      <button
        type="button"
        className={cx(styles.vehicleAttachmentButton, isSelected && styles.vehicleAttachmentButtonActive)}
        onClick={() => onOpen({ id, label, url })}
        aria-pressed={isSelected}
        aria-label={`${label} зураг томоор харах`}
      >
        <Image
          src={url}
          alt={`${label} #${id}`}
          width={220}
          height={140}
          unoptimized
          onError={() => setFailedId(id)}
        />
        <span>Файл #{id}</span>
      </button>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer">
      <span className={styles.vehicleDocumentIcon} aria-hidden>
        Файл
      </span>
      <span>Файл #{id}</span>
    </a>
  );
}

function VehicleAttachmentViewer({
  attachment,
  onClose,
}: {
  attachment: { id: number; label: string; url: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.vehicleImageViewerOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.vehicleImageViewer}
        role="dialog"
        aria-modal="true"
        aria-label={`${attachment.label} зураг`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.vehicleImageViewerHeader}>
          <button type="button" onClick={onClose}>
            <ArrowLeft size={20} strokeWidth={2.4} aria-hidden />
            Буцах
          </button>
          <strong>{attachment.label}</strong>
        </header>
        <div className={styles.vehicleImageViewerStage}>
          <Image
            src={attachment.url}
            alt={`${attachment.label} #${attachment.id}`}
            width={1600}
            height={1200}
            unoptimized
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FileUploadField({
  name,
  label,
  accept,
  existingId,
}: {
  name: string;
  label: string;
  accept: string;
  existingId?: number;
}) {
  const inputId = useId();
  const clearInputId = useId();
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [selectedIsImage, setSelectedIsImage] = useState(false);
  const [existingFailed, setExistingFailed] = useState(false);
  const [clearExisting, setClearExisting] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreviewName(file?.name || "");
    setSelectedIsImage(Boolean(file?.type.startsWith("image/")));
    if (file) {
      setClearExisting(false);
    }
    setPreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return file && file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    });
  }

  const existingUrl = existingId ? attachmentUrl(existingId) : "";

  return (
    <div className={styles.vehicleFileField}>
      <label htmlFor={inputId}>
        <UploadCloud size={16} aria-hidden />
        {label}
      </label>
      <input id={inputId} name={name} type="file" accept={accept} onChange={handleFileChange} />
      {previewUrl && selectedIsImage ? (
        <span className={styles.vehicleFilePreview}>
          <Image src={previewUrl} alt={`${label} preview`} width={220} height={132} unoptimized />
          <small>{previewName}</small>
        </span>
      ) : previewName ? (
        <span className={styles.vehicleFilePreview}>
          <span className={styles.vehicleDocumentIcon} aria-hidden>
            Файл
          </span>
          <small>{previewName}</small>
        </span>
      ) : existingUrl && !clearExisting ? (
        <div className={styles.vehicleFileExisting}>
          <a className={styles.vehicleFilePreview} href={existingUrl} target="_blank" rel="noreferrer">
            {!existingFailed ? (
              <Image
                src={existingUrl}
                alt={label}
                width={220}
                height={132}
                unoptimized
                onError={() => setExistingFailed(true)}
              />
            ) : (
              <span className={styles.vehicleDocumentIcon} aria-hidden>
                Файл
              </span>
            )}
            <small>Одоо бүртгэлтэй файл #{existingId}</small>
          </a>
          <label className={styles.vehicleFileClear} htmlFor={clearInputId}>
            <input
              id={clearInputId}
              name={`${name}_clear`}
              type="checkbox"
              checked={clearExisting}
              onChange={(event) => setClearExisting(event.target.checked)}
            />
            <span>Устгах</span>
          </label>
        </div>
      ) : existingUrl && clearExisting ? (
        <label className={styles.vehicleFileClearPending} htmlFor={clearInputId}>
          <input
            id={clearInputId}
            name={`${name}_clear`}
            type="checkbox"
            checked={clearExisting}
            onChange={(event) => setClearExisting(event.target.checked)}
          />
          <span>Хадгалах үед энэ файл устгагдана</span>
        </label>
      ) : null}
    </div>
  );
}

function AttachmentGallery({
  title,
  groups,
  previewImages = false,
}: {
  title: string;
  groups: FleetVehicleAttachmentGroup[];
  previewImages?: boolean;
}) {
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<number | null>(null);
  const [viewerAttachment, setViewerAttachment] = useState<{
    id: number;
    label: string;
    url: string;
  } | null>(null);
  const visibleGroups = groups.filter((group) => group.ids.length);
  const attachmentCount = visibleGroups.reduce((sum, group) => sum + group.ids.length, 0);
  const previewAttachments = previewImages
    ? visibleGroups.flatMap((group) =>
        group.ids.map((id) => ({
          id,
          label: `${group.label} зураг`,
          url: attachmentUrl(id),
        })),
      )
    : [];
  const selectedAttachment =
    previewAttachments.find((attachment) => attachment.id === selectedAttachmentId) ?? previewAttachments[0] ?? null;

  if (!visibleGroups.length) {
    return <EmptyPanel>{`${title} бүртгэгдээгүй байна.`}</EmptyPanel>;
  }

  return (
    <div className={cx(styles.vehicleAttachmentPanel, previewImages && styles.vehicleAttachmentPanelPreview)}>
      <div className={styles.vehicleAttachmentHeader}>
        <span className={styles.mobileDetailEyebrow}>{title}</span>
        <strong>{attachmentCount} файл</strong>
      </div>
      {previewImages && selectedAttachment ? (
        <button
          type="button"
          className={styles.vehicleGalleryHero}
          onClick={() => setViewerAttachment(selectedAttachment)}
          aria-label={`${selectedAttachment.label} томоор харах`}
        >
          <Image
            src={selectedAttachment.url}
            alt={`${selectedAttachment.label} #${selectedAttachment.id}`}
            width={960}
            height={580}
            unoptimized
          />
          <span>{selectedAttachment.label}</span>
        </button>
      ) : null}
      {visibleGroups.map((group) => (
        <section key={group.key} className={styles.vehicleAttachmentGroup}>
          <strong>{group.label}</strong>
          <div className={styles.vehicleAttachmentGrid}>
            {group.ids.map((id) => (
              <AttachmentTile
                key={id}
                id={id}
                label={`${group.label} зураг`}
                previewImages={previewImages}
                onOpen={
                  previewImages
                    ? (attachment) => setSelectedAttachmentId(attachment.id)
                    : setViewerAttachment
                }
                isSelected={previewImages && selectedAttachment?.id === id}
              />
            ))}
          </div>
        </section>
      ))}
      {viewerAttachment ? (
        <VehicleAttachmentViewer
          attachment={viewerAttachment}
          onClose={() => setViewerAttachment(null)}
        />
      ) : null}
    </div>
  );
}

function firstAttachmentId(groups: FleetVehicleAttachmentGroup[], key: string) {
  return groups.find((group) => group.key === key)?.ids[0];
}

function VehicleUploadFields({ vehicle }: { vehicle?: FleetVehicleBoardItem }) {
  return (
    <div className={styles.vehicleUploadSection}>
      <span className={styles.mobileDetailEyebrow}>Зураг, баримт хавсаргах</span>
      <FileUploadField
        name="municipal_front_photo_ids"
        label="Урд талаас авсан зураг"
        accept="image/*"
        existingId={vehicle ? firstAttachmentId(vehicle.photoGroups, "front") : undefined}
      />
      <FileUploadField
        name="municipal_rear_photo_ids"
        label="Ард талаас авсан зураг"
        accept="image/*"
        existingId={vehicle ? firstAttachmentId(vehicle.photoGroups, "rear") : undefined}
      />
      <FileUploadField
        name="municipal_side_photo_ids"
        label="Хажуу талаас авсан зураг"
        accept="image/*"
        existingId={vehicle ? firstAttachmentId(vehicle.photoGroups, "side") : undefined}
      />
      <FileUploadField
        name="municipal_certificate_photo_ids"
        label="Гэрчилгээний зураг"
        accept="image/*"
        existingId={vehicle ? firstAttachmentId(vehicle.photoGroups, "certificate") : undefined}
      />
      <FileUploadField
        name="municipal_insurance_attachment_ids"
        label="Даатгалын баримт"
        accept="image/*,.pdf"
        existingId={vehicle ? firstAttachmentId(vehicle.documentGroups, "insurance") : undefined}
      />
      <FileUploadField
        name="municipal_insurance_contract_attachment_ids"
        label="Даатгалын гэрээ"
        accept="image/*,.pdf"
        existingId={vehicle ? firstAttachmentId(vehicle.documentGroups, "insurance-contract") : undefined}
      />
      <FileUploadField
        name="municipal_inspection_attachment_ids"
        label="Улсын үзлэгийн баримт"
        accept="image/*,.pdf"
        existingId={vehicle ? firstAttachmentId(vehicle.documentGroups, "inspection") : undefined}
      />
    </div>
  );
}

function VehicleList({
  vehicles,
  emptyLabel,
  onSelectVehicle,
  viewMode,
}: {
  vehicles: FleetVehicleBoardItem[];
  emptyLabel: string;
  onSelectVehicle: (vehicle: FleetVehicleBoardItem) => void;
  viewMode: VehicleViewMode;
}) {
  if (!vehicles.length) {
    return <div className={styles.emptyState}>{emptyLabel}</div>;
  }

  return (
    <div className={cx(styles.vehicleList, viewMode === "list" && styles.vehicleListRows)}>
      {vehicles.map((vehicle) => {
        const status = vehicleStatusMeta(vehicle);

        return (
          <article key={vehicle.id} className={cx(styles.vehicleCard, styles[`vehicleCard_${status.tone}`])}>
            <button
              type="button"
              className={styles.vehicleCardMain}
              onClick={() => onSelectVehicle(vehicle)}
            >
              <div className={styles.vehicleMedia}>
                <VehicleThumbnail vehicle={vehicle} />
                <span className={cx(styles.vehicleState, styles[`vehicleState_${status.tone}`])}>
                  {status.label}
                </span>
              </div>

              <div className={styles.vehicleCardBody}>
                <div className={styles.vehicleTop}>
                  <div>
                    <strong className={styles.vehiclePlate}>{vehicle.plate}</strong>
                    <p className={styles.vehicleName}>{vehicle.modelName || vehicle.name}</p>
                  </div>
                  <span className={styles.vehicleTypeLine}>{vehicle.vehicleTypeName || vehicle.categoryName || "Төрөлгүй"}</span>
                </div>

                <div className={styles.vehicleInfoGrid}>
                  <span>
                    <User size={15} aria-hidden />
                    <small>Жолооч</small>
                    <strong>{vehicle.responsibleDriverName || vehicle.fleetDriverName || "Оноогоогүй"}</strong>
                  </span>
                  <span>
                    <Truck size={15} aria-hidden />
                    <small>Хэлтэс</small>
                    <strong>{vehicle.departmentName || "Бүртгээгүй"}</strong>
                  </span>
                  <span>
                    <ShieldAlert size={15} aria-hidden />
                    <small>Даатгал</small>
                    <strong>{shortDeadlineLabel(vehicle.insurance)}</strong>
                  </span>
                  <span>
                    <CalendarCheck2 size={15} aria-hidden />
                    <small>Үзлэг</small>
                    <strong>{shortDeadlineLabel(vehicle.inspection)}</strong>
                  </span>
                </div>
              </div>

              <span className={styles.vehicleMore} aria-hidden>
                <MoreHorizontal size={18} />
              </span>
            </button>
          </article>
        );
      })}
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

function VehicleQuickFact({
  icon: Icon,
  label,
  value,
  tone = "green",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "green" | "blue" | "orange" | "neutral";
}) {
  return (
    <div className={cx(styles.vehicleQuickFact, styles[`vehicleQuickFact_${tone}`])}>
      <span className={styles.vehicleQuickFactIcon}>
        <Icon size={21} aria-hidden />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value || "Бүртгээгүй"}</strong>
      </div>
    </div>
  );
}

function VehicleInfoPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className={styles.vehicleInfoPanel}>
      <div className={styles.vehicleInfoPanelHeader}>
        <span>
          <Icon size={18} aria-hidden />
        </span>
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function namesLabel(names: string[]) {
  return names.length ? names.join(", ") : "Оноогоогүй";
}

function directCrewMembers(vehicle: FleetVehicleBoardItem) {
  return [
    vehicle.responsibleDriverName
      ? { key: "driver", label: "Хариуцсан жолооч", name: vehicle.responsibleDriverName }
      : null,
    vehicle.loader1Name ? { key: "loader1", label: "Ачигч 1", name: vehicle.loader1Name } : null,
    vehicle.loader2Name ? { key: "loader2", label: "Ачигч 2", name: vehicle.loader2Name } : null,
  ].filter((member): member is { key: string; label: string; name: string } => Boolean(member));
}

function uniqueCrewNames(names: string[]) {
  const seen = new Set<string>();
  return names.filter((name) => {
    const normalized = normalizeStaffText(name);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function assignedDriverCount(vehicle: FleetVehicleBoardItem) {
  return uniqueCrewNames([
    vehicle.responsibleDriverName,
    ...vehicle.crewAssignments.flatMap((assignment) => assignment.driverNames),
  ]).length;
}

function assignedLoaderCount(vehicle: FleetVehicleBoardItem) {
  return uniqueCrewNames([
    vehicle.loader1Name,
    vehicle.loader2Name,
    ...vehicle.crewAssignments.flatMap((assignment) => assignment.loaderNames),
  ]).length;
}

function assignedCrewCount(vehicle: FleetVehicleBoardItem) {
  return uniqueCrewNames([
    vehicle.responsibleDriverName,
    vehicle.loader1Name,
    vehicle.loader2Name,
    ...vehicle.crewAssignments.flatMap((assignment) => [
      ...assignment.driverNames,
      ...assignment.loaderNames,
      ...assignment.memberNames,
    ]),
  ]).length;
}

function operationTypeLabel(value: string) {
  const labels: Record<string, string> = {
    garbage: "Хог тээвэр",
    street_cleaning: "Гудамж цэвэрлэгээ",
    green_maintenance: "Ногоон байгууламж",
  };
  return labels[value] ?? value;
}

const vehicleStatusOptions = [
  { value: "available", label: "Ажиллаж байгаа" },
  { value: "in_repair", label: "Засвартай" },
  { value: "broken", label: "Эвдэрсэн" },
  { value: "retired", label: "Ашиглалтаас гарсан" },
  { value: "inactive", label: "Идэвхгүй" },
];

const fuelTypeOptions = [
  { value: "diesel", label: "Дизель" },
  { value: "gasoline", label: "Бензин" },
  { value: "electric", label: "Цахилгаан" },
  { value: "hybrid", label: "Хосолсон" },
  { value: "lpg", label: "Газ" },
];

function displayValue(value?: string | number) {
  return value === undefined || value === null || value === "" ? "Бүртгээгүй" : String(value);
}

function formatFuelLiters(value: number) {
  return `${new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 2,
  }).format(value)} л`;
}

function vehicleFuelSummary(vehicle: FleetVehicleBoardItem) {
  const reports = vehicle.fuelReports;
  const latestReport = reports[0] ?? null;
  const totalLiters = reports.reduce((sum, report) => sum + report.fuelLiters, 0);

  return {
    latestReport,
    totalLabel: reports.length ? formatFuelLiters(totalLiters) : "",
  };
}

function normalizeStaffText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatStaffOption(option: FleetVehicleDriverOption) {
  return [
    option.name,
    option.departmentName,
    option.jobTitle,
    option.active ? "" : "Идэвхгүй",
  ]
    .filter(Boolean)
    .join(" · ");
}

function findStaffOption(value: string, options: FleetVehicleDriverOption[]) {
  const normalized = normalizeStaffText(value);
  if (!normalized) {
    return null;
  }

  const exact = options.find(
    (option) =>
      normalizeStaffText(formatStaffOption(option)) === normalized ||
      normalizeStaffText(option.name) === normalized,
  );
  if (exact) {
    return exact;
  }

  const startsWithMatches = options.filter((option) =>
    normalizeStaffText(formatStaffOption(option)).startsWith(normalized),
  );
  if (startsWithMatches.length === 1) {
    return startsWithMatches[0];
  }

  const includesMatches = options.filter((option) =>
    normalizeStaffText(formatStaffOption(option)).includes(normalized),
  );
  return includesMatches.length === 1 ? includesMatches[0] : null;
}

function DeadlinePanel({
  title,
  info,
}: {
  title: string;
  info: FleetVehicleDeadlineInfo;
}) {
  return (
    <div className={styles.deadlinePanel}>
      <div className={styles.deadlinePanelHeader}>
        <strong>{title}</strong>
        {info.reminderDue ? <span className={styles.warningBadge}>Сануулах</span> : null}
      </div>
      <div className={styles.vehicleDetailGrid}>
        {"company" in info ? <DetailItem label="Компани" value={info.company || ""} /> : null}
        {"policyNumber" in info ? <DetailItem label="Гэрээний дугаар" value={info.policyNumber || ""} /> : null}
        <DetailItem label="Эхлэх / орсон огноо" value={info.startDate || ""} />
        <DetailItem label="Дуусах / дараагийн огноо" value={info.endDate || ""} />
        <DetailItem label="Үлдсэн хоног" value={String(info.daysRemaining || 0)} />
        <DetailItem label="Баримт" value={`${info.attachmentCount || 0} файл`} />
        {"contractAttachmentCount" in info ? (
          <DetailItem label="Даатгалын гэрээ" value={`${info.contractAttachmentCount || 0} файл`} />
        ) : null}
      </div>
      {info.attachmentIds.length || info.contractAttachmentIds?.length ? (
        <div className={styles.vehicleDocumentLinks}>
          {info.attachmentIds.map((id) => (
            <a key={`attachment-${id}`} href={attachmentUrl(id)} target="_blank" rel="noreferrer">
              Баримт #{id}
            </a>
          ))}
          {info.contractAttachmentIds?.map((id) => (
            <a key={`contract-${id}`} href={attachmentUrl(id)} target="_blank" rel="noreferrer">
              Даатгалын гэрээ #{id}
            </a>
          ))}
        </div>
      ) : null}
      {info.note ? <p className={styles.inlineNote}>{info.note}</p> : null}
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className={styles.emptyState}>{children}</div>;
}

function DriverHistoryList({ items }: { items: FleetVehicleDriverHistoryItem[] }) {
  if (!items.length) {
    return <EmptyPanel>Жолоочийн түүх бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <strong>{item.driverName}</strong>
          <span>{displayValue(item.dateStart)} - {displayValue(item.dateEnd)}</span>
          <small>{displayValue(item.changedBy)} · {displayValue(item.changedDate)}</small>
        </article>
      ))}
    </div>
  );
}

function StaffPicker({
  vehicleId,
  name,
  label,
  placeholder,
  options,
  defaultId,
}: {
  vehicleId: number;
  name: string;
  label: string;
  placeholder: string;
  options: FleetVehicleDriverOption[];
  defaultId: number | null;
}) {
  const defaultOption = defaultId ? options.find((option) => option.id === defaultId) : undefined;
  const [query, setQuery] = useState(defaultOption ? formatStaffOption(defaultOption) : "");
  const [selectedId, setSelectedId] = useState(defaultOption ? String(defaultOption.id) : "");
  const listId = `${name}-${vehicleId}-options`;
  const hasUnmatchedQuery = query.trim().length > 0 && !selectedId;

  function updateSelection(value: string) {
    setQuery(value);
    const selected = findStaffOption(value, options);
    setSelectedId(selected ? String(selected.id) : "");
  }

  function clearSelection() {
    setQuery("");
    setSelectedId("");
  }

  return (
    <label className={styles.vehicleFormField}>
      <span>{label}</span>
      <input type="hidden" name={name} value={selectedId} />
      <div className={styles.staffPickerControl}>
        <input
          name={`${name}_label`}
          list={listId}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => updateSelection(event.target.value)}
          onBlur={(event) => updateSelection(event.target.value)}
        />
        {query || selectedId ? (
          <button type="button" onClick={clearSelection}>
            Арилгах
          </button>
        ) : null}
      </div>
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={formatStaffOption(option)} />
        ))}
      </datalist>
      {hasUnmatchedQuery ? (
        <small className={styles.formHintError}>HR жагсаалтаас сонгоно уу.</small>
      ) : null}
    </label>
  );
}

function DriverAssignmentForm({
  vehicle,
  driverOptions,
  loaderOptions,
}: {
  vehicle: FleetVehicleBoardItem;
  driverOptions: FleetVehicleDriverOption[];
  loaderOptions: FleetVehicleDriverOption[];
}) {
  return (
    <section className={styles.driverAssignmentPanel}>
      <div className={styles.driverAssignmentIntro}>
        <span className={styles.mobileDetailEyebrow}>Хүний нөөц</span>
        <div>
          <h3>Жолооч, ачигч оноох</h3>
          <p>
            HR бүртгэлтэй жолооч болон ачигчаас сонгож хадгалахад өмнөх жолоочийн түүх автоматаар үлдэнэ.
          </p>
        </div>
      </div>

      <form action={updateFleetVehicleAction} className={styles.driverAssignmentForm}>
        <input type="hidden" name="vehicle_id" value={vehicle.id} />

        <StaffPicker
          key={`driver-${vehicle.id}-${vehicle.responsibleDriverId ?? "none"}`}
          vehicleId={vehicle.id}
          name="municipal_responsible_driver_id"
          label="Хариуцсан жолооч"
          placeholder="Жолоочийн нэр бичиж HR жагсаалтаас сонгох"
          options={driverOptions}
          defaultId={vehicle.responsibleDriverId}
        />

        <StaffPicker
          key={`loader1-${vehicle.id}-${vehicle.loader1Id ?? "none"}`}
          vehicleId={vehicle.id}
          name="municipal_loader_1_id"
          label="Ачигч 1"
          placeholder="Ачигчийн нэр бичиж HR жагсаалтаас сонгох"
          options={loaderOptions}
          defaultId={vehicle.loader1Id}
        />

        <StaffPicker
          key={`loader2-${vehicle.id}-${vehicle.loader2Id ?? "none"}`}
          vehicleId={vehicle.id}
          name="municipal_loader_2_id"
          label="Ачигч 2"
          placeholder="Ачигчийн нэр бичиж HR жагсаалтаас сонгох"
          options={loaderOptions}
          defaultId={vehicle.loader2Id}
        />

        <div className={styles.driverAssignmentMeta}>
          <span>Одоогийн бүрэлдэхүүн</span>
          <strong>{vehicle.responsibleDriverName || "Жолооч оноогоогүй"}</strong>
          <small>
            Ачигч 1: {vehicle.loader1Name || "оноогоогүй"} · Ачигч 2:{" "}
            {vehicle.loader2Name || "оноогоогүй"}
          </small>
          <small>{driverOptions.length} HR жолооч · {loaderOptions.length} HR ачигч</small>
        </div>

        <div className={styles.vehicleModalActions}>
          <button type="submit" className={styles.primaryButton}>
            Бүрэлдэхүүн хадгалах
          </button>
        </div>
      </form>
    </section>
  );
}

function RepairHistoryList({ items }: { items: FleetVehicleRepairHistoryItem[] }) {
  if (!items.length) {
    return <EmptyPanel>Засварын түүх бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <div className={styles.historyRowTop}>
            <strong>{item.name}</strong>
            <span className={styles.stateBadge}>{item.stateLabel || "Төлөвгүй"}</span>
          </div>
          <span>{item.damageType || item.description || "Эвдрэлийн мэдээлэлгүй"}</span>
          {item.damageType && item.description ? (
            <p className={styles.historyText}>Тайлбар: {item.description}</p>
          ) : null}
          {item.partsNote ? <p className={styles.historyText}>Сэлбэг: {item.partsNote}</p> : null}
          {item.repairNote ? (
            <p className={styles.historyText}>Засварын тэмдэглэл: {item.repairNote}</p>
          ) : null}
          <small>
            {displayValue(item.requestDate)} · {displayValue(item.mechanicName)} · {item.amountLabel}
          </small>
          {item.procurementName ? <small>Худалдан авалт: {item.procurementName}</small> : null}
        </article>
      ))}
    </div>
  );
}

function VehicleRepairStatusForm({
  vehicle,
  activeRepair,
  mode,
}: {
  vehicle: FleetVehicleBoardItem;
  activeRepair: FleetVehicleRepairHistoryItem | null;
  mode: "start" | "done";
}) {
  const isDone = mode === "done";
  return (
    <form action={updateFleetVehicleAction} className={styles.vehicleRepairActionForm}>
      <input type="hidden" name="vehicle_id" value={vehicle.id} />
      <input type="hidden" name="vehicle_repair_toggle" value={mode} />
      <label className={styles.vehicleRepairActionField}>
        <span>{isDone ? "Хийсэн засварын тайлбар" : "Эвдрэл / засварын тайлбар"}</span>
        <textarea
          name={isDone ? "repair_completion_note" : "repair_damage_description"}
          required
          rows={4}
          defaultValue={isDone ? activeRepair?.repairNote || "" : ""}
          placeholder={
            isDone
              ? "Жишээ: Тоормосны наклад сольж, систем шалгав."
              : "Жишээ: Тоормос дуугарч байна, тос гоожсон, баруун урд дугуй хагарсан."
          }
        />
      </label>
      {!isDone ? (
        <label className={styles.vehicleRepairActionField}>
          <span>Эвдрэлийн төрөл</span>
          <input
            name="repair_damage_type"
            defaultValue={activeRepair?.damageType || ""}
            placeholder="Жишээ: Хөдөлгүүр, тоормос, дугуй"
          />
        </label>
      ) : null}
      <button
        type="submit"
        className={cx(
          styles.primaryButton,
          isDone ? styles.vehicleRepairCompleteSubmit : styles.vehicleRepairStartSubmit,
        )}
      >
        <Wrench size={16} aria-hidden />
        {isDone ? "Засвар дуусгах" : "Засвартай болгох"}
      </button>
    </form>
  );
}

function ActiveRepairPanel({
  vehicle,
  activeRepair,
}: {
  vehicle: FleetVehicleBoardItem;
  activeRepair: FleetVehicleRepairHistoryItem | null;
}) {
  if (!vehicle.isRepair) {
    return null;
  }
  return (
    <section className={styles.activeRepairPanel}>
      <div className={styles.activeRepairHeader}>
        <div>
          <span className={styles.mobileDetailEyebrow}>Авто баазын засвар</span>
          <h3>Идэвхтэй засвар</h3>
        </div>
        <span className={styles.stateBadge}>{activeRepair?.stateLabel || "Засвартай"}</span>
      </div>
      {activeRepair ? (
        <div className={styles.activeRepairGrid}>
          <DetailItem label="Эвдрэлийн төрөл" value={activeRepair.damageType} />
          <DetailItem label="Хүсэлт үүссэн" value={activeRepair.requestDate} />
          <DetailItem label="Засварчин" value={activeRepair.mechanicName} />
          <DetailItem label="Зардал" value={activeRepair.amountLabel} />
        </div>
      ) : null}
      <div className={styles.activeRepairNotes}>
        <p>
          <strong>Эвдрэлийн тайлбар</strong>
          <span>{activeRepair?.description || "Эвдрэлийн тайлбар бүртгэгдээгүй байна."}</span>
        </p>
        {activeRepair?.partsNote ? (
          <p>
            <strong>Сэлбэгийн тэмдэглэл</strong>
            <span>{activeRepair.partsNote}</span>
          </p>
        ) : null}
        {activeRepair?.repairNote ? (
          <p>
            <strong>Засварын тэмдэглэл</strong>
            <span>{activeRepair.repairNote}</span>
          </p>
        ) : null}
      </div>
      <div className={styles.activeRepairFinish}>
        <h4>Засвар дуусгах</h4>
        <VehicleRepairStatusForm vehicle={vehicle} activeRepair={activeRepair} mode="done" />
      </div>
    </section>
  );
}

function NewVehicleForm({
  modelOptions,
  vehicleTypeOptions,
  categoryOptions,
  departmentOptions,
  onCancel,
}: {
  modelOptions: FleetVehicleSelectOption[];
  vehicleTypeOptions: FleetVehicleSelectOption[];
  categoryOptions: FleetVehicleSelectOption[];
  departmentOptions: FleetVehicleDepartmentOption[];
  onCancel: () => void;
}) {
  const modelListId = useId();
  const vehicleTypeListId = useId();

  return (
    <section className={styles.vehicleCreatePanel}>
      <div className={styles.vehicleCreateHeader}>
        <div>
          <span className={styles.mobileDetailEyebrow}>Шинэ бүртгэл</span>
          <h2>Машин техник нэмэх</h2>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>
          Болих
        </button>
      </div>

      <form action={createFleetVehicleAction} className={styles.vehicleEditForm}>
        <label className={styles.vehicleFormField}>
          <span>Улсын дугаар</span>
          <input name="license_plate" required placeholder="Жишээ: 1234УБА" />
        </label>

        <label className={styles.vehicleFormField}>
          <span>Машины нэр</span>
          <input name="name" placeholder="Жишээ: Хог тээврийн машин 01" />
        </label>

        <label className={styles.vehicleFormField}>
          <span>Марка / модель</span>
          <input name="model_name" list={modelListId} placeholder="Жишээ: Kia Bongo" />
          <datalist id={modelListId}>
            {modelOptions.map((option) => (
              <option key={option.id} value={option.name} />
            ))}
          </datalist>
        </label>

        <label className={styles.vehicleFormField}>
          <span>Төрөл</span>
          {vehicleTypeOptions.length ? (
            <>
              <input name="vehicle_type_name" list={vehicleTypeListId} placeholder="Жишээ: Усалгааны машин" />
              <datalist id={vehicleTypeListId}>
                {vehicleTypeOptions.map((option) => (
                  <option key={option.id} value={option.name} />
                ))}
              </datalist>
            </>
          ) : (
            <select name="category_id" defaultValue="">
              <option value="">Сонгоогүй</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className={styles.vehicleFormField}>
          <span>Хэлтэс</span>
          <select name="municipal_department_id" defaultValue="">
            <option value="">Сонгоогүй</option>
            {departmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.vehicleFormField}>
          <span>Төлөв</span>
          <select name="x_municipal_operational_status" defaultValue="available">
            {vehicleStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.vehicleFormField}>
          <span>Түлшний төрөл</span>
          <select name="fuel_type" defaultValue="">
            <option value="">Сонгоогүй</option>
            {fuelTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.vehicleFormField}>
          <span>Даац</span>
          <input name="municipal_capacity" placeholder="Жишээ: 8 тн" />
        </label>

        <label className={styles.vehicleFormField}>
          <span>Импортлосон огноо</span>
          <input name="municipal_import_date" type="date" />
        </label>

        <label className={styles.vehicleFormField}>
          <span>Өнгө</span>
          <input name="municipal_color" placeholder="Жишээ: цагаан" />
        </label>

        <label className={styles.vehicleFormField}>
          <span>Үйлдвэрлэсэн огноо</span>
          <input name="municipal_manufactured_date" type="date" />
        </label>

        <label className={styles.vehicleFormField}>
          <span>Суудлын тоо</span>
          <input name="municipal_seat_count" type="number" min="0" step="1" placeholder="0" />
        </label>

        <VehicleUploadFields />

        <div className={styles.vehicleModalActions}>
          <button type="submit" className={styles.primaryButton}>
            <Plus size={16} aria-hidden />
            Нэмэх
          </button>
        </div>
      </form>
    </section>
  );
}

function WeightReportList({ items }: { items: FleetVehicleDailyWeightItem[] }) {
  if (!items.length) {
    return <EmptyPanel>Жингийн тайлан бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <div className={styles.historyRowTop}>
            <strong>{item.weightLabel}</strong>
            <span className={styles.stateBadge}>{item.stateLabel}</span>
          </div>
          <span>{displayValue(item.reportDate)} · {displayValue(item.source)}</span>
          {item.errorMessage ? <small>{item.errorMessage}</small> : <small>Татсан: {displayValue(item.fetchedAt)}</small>}
        </article>
      ))}
    </div>
  );
}

function FuelReportList({ items }: { items: FleetVehicleDailyFuelItem[] }) {
  if (!items.length) {
    return <EmptyPanel>Шатахууны мэдээлэл бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <div className={styles.historyRowTop}>
            <strong>{item.fuelLabel}</strong>
            <span className={styles.stateBadge}>{item.stateLabel}</span>
          </div>
          <span>{displayValue(item.reportDate)} · {displayValue(item.fuelType)}</span>
          {item.errorMessage ? <small>{item.errorMessage}</small> : <small>Татсан: {displayValue(item.fetchedAt)}</small>}
        </article>
      ))}
    </div>
  );
}

function ProcurementList({ items }: { items: FleetVehicleProcurementLink[] }) {
  if (!items.length) {
    return <EmptyPanel>Худалдан авалтын холбоос бүртгэгдээгүй байна.</EmptyPanel>;
  }
  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <article key={item.id} className={styles.historyRow}>
          <div className={styles.historyRowTop}>
            <strong>{item.name}</strong>
            <span className={styles.stateBadge}>{item.stateLabel}</span>
          </div>
          <span>{displayValue(item.repairName)}</span>
          <small>{item.amountLabel}</small>
        </article>
      ))}
    </div>
  );
}

function VehicleDetailModal({
  vehicle,
  driverOptions,
  loaderOptions,
  departmentOptions,
  modelOptions,
  vehicleTypeOptions,
  categoryOptions,
  onClose,
}: {
  vehicle: FleetVehicleBoardItem;
  driverOptions: FleetVehicleDriverOption[];
  loaderOptions: FleetVehicleDriverOption[];
  departmentOptions: FleetVehicleDepartmentOption[];
  modelOptions: FleetVehicleSelectOption[];
  vehicleTypeOptions: FleetVehicleSelectOption[];
  categoryOptions: FleetVehicleSelectOption[];
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState("main");
  const modelListId = useId();
  const vehicleTypeListId = useId();
  const modalRef = useRef<HTMLElement | null>(null);
  const hasOperationsData =
    vehicle.weightReports.length > 0 ||
    vehicle.fuelReports.length > 0 ||
    vehicle.procurementLinks.length > 0;
  const tabs = [
    { key: "main", label: "Үндсэн мэдээлэл" },
    { key: "edit", label: "Мэдээлэл засах" },
    { key: "driver", label: "Хариуцсан хүмүүс" },
    { key: "compliance", label: "Даатгал ба үзлэг" },
    { key: "repair", label: "Засварын түүх" },
    ...(hasOperationsData ? [{ key: "operations", label: "Тайлан ба худалдан авалт" }] : []),
  ];
  const directCrew = directCrewMembers(vehicle);
  const crewCount = assignedCrewCount(vehicle);
  const driverCount = assignedDriverCount(vehicle);
  const loaderCount = assignedLoaderCount(vehicle);
  const status = vehicleStatusMeta(vehicle);
  const modelSummary = [vehicle.modelName || vehicle.name, vehicle.plate].filter(Boolean).join("/");
  const typeSummary = vehicle.vehicleTypeName || vehicle.categoryName || "Төрөлгүй";
  const activeRepair = activeRepairForVehicle(vehicle);
  const fuelSummary = vehicleFuelSummary(vehicle);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.scrollTo({ top: 0 });

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [vehicle.id]);

  const modal = (
    <div className={styles.vehicleModalBackdrop} role="presentation" onClick={onClose}>
      <section
        ref={modalRef}
        className={styles.vehicleModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`vehicle-detail-${vehicle.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.vehicleModalHeader}>
          <div className={styles.vehicleModalTitleBlock}>
            <div className={styles.vehicleModalKickerRow}>
              <span className={styles.mobileDetailEyebrow}>Машины дэлгэрэнгүй</span>
              <span className={cx(styles.vehicleState, styles[`vehicleState_${status.tone}`])}>
                {status.label}
              </span>
            </div>
            <h2 id={`vehicle-detail-${vehicle.id}`}>{vehicle.plate}</h2>
            <p>
              {modelSummary || vehicle.name}
              {typeSummary ? <span aria-hidden> · </span> : null}
              {typeSummary}
            </p>
            <div className={styles.vehicleModalMetaLine}>
              <span>Арлын дугаар: {displayValue(vehicle.vin)}</span>
              <span>Хэлтэс: {displayValue(vehicle.departmentName)}</span>
            </div>
          </div>
          <div className={styles.vehicleModalHeaderActions}>
            <details className={styles.vehicleRepairAction}>
              <summary
                className={cx(
                  styles.vehicleModalActionButton,
                  styles.vehicleRepairToggleButton,
                  vehicle.isRepair
                    ? styles.vehicleRepairToggleButtonDone
                    : styles.vehicleRepairToggleButtonStart,
                )}
              >
                <Wrench size={17} aria-hidden />
                {vehicle.isRepair ? "Засвар дуусгах" : "Засварт шилжүүлэх"}
              </summary>
              <VehicleRepairStatusForm
                vehicle={vehicle}
                activeRepair={activeRepair}
                mode={vehicle.isRepair ? "done" : "start"}
              />
            </details>
            <button type="button" className={styles.vehicleModalActionButton} onClick={() => setActiveTab("compliance")}>
              <ShieldAlert size={17} aria-hidden />
              Даатгал
            </button>
            <button type="button" className={styles.vehicleModalActionButton} onClick={() => setActiveTab("repair")}>
              <CalendarCheck2 size={17} aria-hidden />
              Түүх
            </button>
            <button type="button" className={styles.vehicleModalIconButton} aria-label="Хаах" onClick={onClose}>
              <X size={20} aria-hidden />
            </button>
          </div>
        </div>

        <div className={styles.vehicleTabBar} role="tablist" aria-label="Машины дэлгэрэнгүй цонхнууд">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={cx(styles.vehicleTabButton, activeTab === tab.key && styles.vehicleTabButtonActive)}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "main" ? (
          <section className={styles.vehicleTabPanel}>
            <ActiveRepairPanel vehicle={vehicle} activeRepair={activeRepair} />
            <div className={styles.vehicleOverviewGrid}>
              <div className={styles.vehicleGalleryPanel}>
                <AttachmentGallery title="Машины зураг" groups={vehicle.photoGroups} previewImages />
              </div>

              <section className={styles.vehicleQuickPanel}>
                <div className={styles.vehicleQuickPanelHeader}>
                  <h3>Товч мэдээлэл</h3>
                  <span>{typeSummary}</span>
                </div>
                <div className={styles.vehicleQuickGrid}>
                  <VehicleQuickFact
                    icon={Car}
                    label="Төлөв"
                    value={vehicle.stateLabel}
                    tone={status.tone === "warning" || status.tone === "repair" ? "orange" : "green"}
                  />
                  <VehicleQuickFact
                    icon={Wrench}
                    label="Сүүлийн засвар"
                    value={vehicle.repairHistory[0]?.requestDate || vehicle.latestRepairState || ""}
                    tone="neutral"
                  />
                  <VehicleQuickFact
                    icon={CalendarCheck2}
                    label="Үзлэг дуусах"
                    value={vehicle.inspection.endDate || ""}
                    tone="blue"
                  />
                  <VehicleQuickFact
                    icon={ShieldAlert}
                    label="Даатгал дуусах"
                    value={vehicle.insurance.endDate || ""}
                    tone={vehicle.insurance.reminderDue ? "orange" : "green"}
                  />
                  <VehicleQuickFact
                    icon={Truck}
                    label="Ашиглалт"
                    value={vehicle.isOperational ? "Идэвхтэй ашиглаж байна" : "Идэвхгүй"}
                    tone={vehicle.isOperational ? "green" : "neutral"}
                  />
                  <VehicleQuickFact
                    icon={CalendarCheck2}
                    label="Явсан зам"
                    value={vehicle.odometerLabel}
                    tone="neutral"
                  />
                </div>
              </section>
            </div>

            <div className={styles.vehicleInfoPanelGrid}>
              <VehicleInfoPanel title="Ерөнхий мэдээлэл" icon={Car}>
                <div className={styles.vehicleDetailGrid}>
                  <DetailItem label="Марка / модель" value={vehicle.modelName || vehicle.name} />
                  <DetailItem label="Төрөл" value={vehicle.vehicleTypeName || vehicle.categoryName} />
                  <DetailItem label="Төлөв" value={vehicle.stateLabel} />
                  <DetailItem label="Арлын дугаар" value={vehicle.vin} />
                  <DetailItem label="Туулсан зам" value={vehicle.odometerLabel} />
                  <DetailItem label="Хэлтэс" value={vehicle.departmentName} />
                  <DetailItem label="Түлшний төрөл" value={vehicle.fuelTypeLabel} />
                  <DetailItem label="Өнгө" value={vehicle.color} />
                </div>
              </VehicleInfoPanel>

              <VehicleInfoPanel title="Хариуцсан хүмүүс" icon={User}>
                <div className={styles.vehicleDetailGrid}>
                  <DetailItem label="Хариуцсан жолооч" value={vehicle.responsibleDriverName} />
                  <DetailItem label="Ачигч 1" value={vehicle.loader1Name} />
                  <DetailItem label="Ачигч 2" value={vehicle.loader2Name} />
                  <DetailItem label="Хуваарилсан хүмүүс" value={`${crewCount} хүн · ${loaderCount} ачигч`} />
                  <DetailItem label="Жолоочийн тоо" value={`${driverCount}`} />
                </div>
              </VehicleInfoPanel>

              <VehicleInfoPanel title="Техникийн мэдээлэл" icon={Wrench}>
                <div className={styles.vehicleDetailGrid}>
                  <DetailItem label="Туулсан зам" value={vehicle.odometerLabel} />
                  <DetailItem label="Даац" value={vehicle.capacity} />
                  <DetailItem label="Импортлосон огноо" value={vehicle.importedDate} />
                  <DetailItem label="Үйлдвэрлэсэн огноо" value={vehicle.manufacturedDate} />
                  <DetailItem label="Суудлын тоо" value={vehicle.seatCountLabel} />
                  <DetailItem label="Төрөл" value={typeSummary} />
                  <DetailItem label="Үйл ажиллагаа" value={vehicle.isOperational ? "Ашиглаж байгаа" : "Идэвхгүй"} />
                  <DetailItem label="Засварын төлөв" value={vehicle.latestRepairState} />
                </div>
              </VehicleInfoPanel>

              <VehicleInfoPanel title="Түлшний мэдээлэл" icon={Truck}>
                <div className={styles.vehicleDetailGrid}>
                  <DetailItem label="Түлшний төрөл" value={vehicle.fuelTypeLabel} />
                  <DetailItem label="Сүүлийн зарцуулалт" value={fuelSummary.latestReport?.fuelLabel} />
                  <DetailItem label="Тайлангийн огноо" value={fuelSummary.latestReport?.reportDate} />
                  <DetailItem label="Сүүлийн тайлангуудын нийт" value={fuelSummary.totalLabel} />
                  <DetailItem label="Татсан огноо" value={fuelSummary.latestReport?.fetchedAt} />
                </div>
              </VehicleInfoPanel>
            </div>

            <section className={styles.vehicleCrewPanel}>
              <div className={styles.vehicleCrewHeader}>
                <span className={styles.mobileDetailEyebrow}>Хуваарилсан хүмүүс</span>
                <strong>{crewCount}</strong>
              </div>
              {crewCount ? (
                <div className={styles.vehicleCrewList}>
                  {directCrew.length ? (
                    <article className={styles.vehicleCrewCard}>
                      <p className={styles.vehicleCrewType}>Шууд оноолт</p>
                      {directCrew.map((member) => (
                        <div key={member.key}>
                          <span>{member.label}</span>
                          <strong>{member.name}</strong>
                        </div>
                      ))}
                    </article>
                  ) : null}
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
                  Энэ машин дээр жолооч, ачигч эсвэл идэвхтэй баг хуваарилагдаагүй байна.
                </p>
              )}
            </section>

            <AttachmentGallery title="Баримт бичиг" groups={vehicle.documentGroups} />
          </section>
        ) : null}

        {activeTab === "driver" ? (
          <section className={styles.vehicleTabPanel}>
            <div className={styles.vehicleDetailGrid}>
              <DetailItem label="Одоогийн жолооч" value={vehicle.responsibleDriverName} />
              <DetailItem label="Ачигч 1" value={vehicle.loader1Name} />
              <DetailItem label="Ачигч 2" value={vehicle.loader2Name} />
              <DetailItem label="Хуваарилсан хүмүүс" value={`${crewCount} хүн · ${loaderCount} ачигч`} />
              <DetailItem label="Жолоочийн тоо" value={`${driverCount}`} />
              <DetailItem label="Төлөв" value={vehicle.stateLabel} />
            </div>
            <DriverAssignmentForm
              vehicle={vehicle}
              driverOptions={driverOptions}
              loaderOptions={loaderOptions}
            />
            <DriverHistoryList items={vehicle.driverHistory} />
          </section>
        ) : null}

        {activeTab === "compliance" ? (
          <section className={cx(styles.vehicleTabPanel, styles.vehicleComplianceGrid)}>
            <DeadlinePanel title="Даатгалын мэдээлэл" info={vehicle.insurance} />
            <DeadlinePanel title="Улсын үзлэгийн мэдээлэл" info={vehicle.inspection} />
          </section>
        ) : null}

        {activeTab === "repair" ? (
          <section className={styles.vehicleTabPanel}>
            <RepairHistoryList items={vehicle.repairHistory} />
          </section>
        ) : null}

        {activeTab === "operations" ? (
          <section className={cx(styles.vehicleTabPanel, styles.vehicleOperationsGrid)}>
            {vehicle.weightReports.length ? (
              <VehicleInfoPanel title="Жингийн тайлан" icon={Truck}>
                <WeightReportList items={vehicle.weightReports} />
              </VehicleInfoPanel>
            ) : null}
            {vehicle.fuelReports.length ? (
              <VehicleInfoPanel title="Шатахуун" icon={Car}>
                <FuelReportList items={vehicle.fuelReports} />
              </VehicleInfoPanel>
            ) : null}
            {vehicle.procurementLinks.length ? (
              <VehicleInfoPanel title="Худалдан авалт" icon={ShieldAlert}>
                <ProcurementList items={vehicle.procurementLinks} />
              </VehicleInfoPanel>
            ) : null}
          </section>
        ) : null}

        {activeTab === "edit" ? (
        <section className={styles.vehicleTabPanel}>
          <form
            key={vehicle.id}
            action={updateFleetVehicleAction}
            className={styles.vehicleEditForm}
          >
          <input type="hidden" name="vehicle_id" value={vehicle.id} />
          <input type="hidden" name="current_operational_status" value={vehicle.operationalStatusKey} />

          <label className={styles.vehicleFormField}>
            <span>Улсын дугаар</span>
            <input name="license_plate" defaultValue={vehicle.plate} />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Машины нэр</span>
            <input name="name" defaultValue={vehicle.name} />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Марка / модель</span>
            <input
              name="model_name"
              list={modelListId}
              defaultValue={vehicle.modelName}
              placeholder="Жишээ: Kia Bongo"
            />
            <datalist id={modelListId}>
              {modelOptions.map((option) => (
                <option key={option.id} value={option.name} />
              ))}
            </datalist>
          </label>

          <label className={styles.vehicleFormField}>
            <span>Төрөл</span>
            {vehicleTypeOptions.length ? (
              <>
                <input
                  name="vehicle_type_name"
                  list={vehicleTypeListId}
                  defaultValue={vehicle.vehicleTypeName}
                  placeholder="Жишээ: Усалгааны машин"
                />
                <datalist id={vehicleTypeListId}>
                  {vehicleTypeOptions.map((option) => (
                    <option key={option.id} value={option.name} />
                  ))}
                </datalist>
              </>
            ) : (
              <select name="category_id" defaultValue={vehicle.categoryId ?? ""}>
                <option value="">Сонгоогүй</option>
                {categoryOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className={styles.vehicleFormField}>
            <span>Төлөв</span>
            <select name="x_municipal_operational_status" defaultValue={vehicle.operationalStatusKey}>
              <option value="">Сонгоогүй</option>
              {vehicleStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={cx(styles.vehicleFormField, styles.vehicleFormFieldWide)}>
            <span>Засвартай бол эвдрэлийн тайлбар</span>
            <textarea
              name="repair_damage_description"
              rows={3}
              defaultValue={vehicle.isRepair ? activeRepair?.description || "" : ""}
              placeholder="Жишээ: Тоормос дуугарч байна, тос гоожсон, баруун урд дугуй хагарсан."
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Эвдрэлийн төрөл</span>
            <input name="repair_damage_type" defaultValue={activeRepair?.damageType || ""} />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Арлын дугаар</span>
            <input name="vin_sn" defaultValue={vehicle.vin} placeholder="Арлын дугаар" />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Туулсан зам</span>
            <input
              name="odometer"
              type="number"
              min="0"
              step="1"
              defaultValue={vehicle.odometerValue}
              placeholder="0"
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Даац</span>
            <input name="municipal_capacity" defaultValue={vehicle.capacity} placeholder="Жишээ: 8 тн" />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Импортлосон огноо</span>
            <input
              name="municipal_import_date"
              type="date"
              defaultValue={vehicle.importedDateValue}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Өнгө</span>
            <input name="municipal_color" defaultValue={vehicle.color} placeholder="Жишээ: цагаан" />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Үйлдвэрлэсэн огноо</span>
            <input
              name="municipal_manufactured_date"
              type="date"
              defaultValue={vehicle.manufacturedDateValue}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Суудлын тоо</span>
            <input
              name="municipal_seat_count"
              type="number"
              min="0"
              step="1"
              defaultValue={vehicle.seatCountValue}
              placeholder="0"
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Хэлтэс</span>
            <select name="municipal_department_id" defaultValue={vehicle.departmentId ?? ""}>
              <option value="">Сонгоогүй</option>
              {departmentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.vehicleFormField}>
            <span>Түлшний төрөл</span>
            <select name="fuel_type" defaultValue={vehicle.fuelTypeKey}>
              <option value="">Сонгоогүй</option>
              {fuelTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.vehicleFormField}>
            <span>Даатгалын компани</span>
            <input name="municipal_insurance_company" defaultValue={vehicle.insurance.company || ""} />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Даатгалын гэрээний дугаар</span>
            <input
              name="municipal_insurance_policy_number"
              defaultValue={vehicle.insurance.policyNumber || ""}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Даатгал эхлэх огноо</span>
            <input
              name="municipal_insurance_date_start"
              type="date"
              defaultValue={vehicle.insurance.startDateValue || ""}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Даатгал дуусах огноо</span>
            <input
              name="municipal_insurance_date_end"
              type="date"
              defaultValue={vehicle.insurance.endDateValue || ""}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Улсын үзлэгт орсон огноо</span>
            <input
              name="municipal_inspection_date"
              type="date"
              defaultValue={vehicle.inspection.startDateValue || ""}
            />
          </label>

          <label className={styles.vehicleFormField}>
            <span>Дараагийн үзлэгийн огноо</span>
            <input
              name="municipal_next_inspection_date"
              type="date"
              defaultValue={vehicle.inspection.endDateValue || ""}
            />
          </label>

          <label className={cx(styles.vehicleFormField, styles.vehicleFormFieldWide)}>
            <span>Даатгалын тайлбар</span>
            <textarea name="municipal_insurance_note" defaultValue={vehicle.insurance.note || ""} />
          </label>

          <label className={cx(styles.vehicleFormField, styles.vehicleFormFieldWide)}>
            <span>Улсын үзлэгийн тайлбар</span>
            <textarea name="municipal_inspection_note" defaultValue={vehicle.inspection.note || ""} />
          </label>

          <VehicleUploadFields vehicle={vehicle} />

          <input type="hidden" name="mfo_active_for_ops_present" value="1" />
          <label className={styles.vehicleCheckbox}>
            <input
              name="mfo_active_for_ops"
              type="checkbox"
              defaultChecked={vehicle.isOperational}
            />
            <span>Үйл ажиллагаанд идэвхтэй ашиглаж байгаа</span>
          </label>

          <div className={cx(styles.vehicleModalActions, styles.vehicleEditActions)}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Болих
            </button>
            <button type="submit" className={styles.primaryButton}>
              Хадгалах
            </button>
          </div>
          </form>

          <form action={archiveFleetVehicleAction} className={styles.vehicleDeleteForm}>
            <input type="hidden" name="vehicle_id" value={vehicle.id} />
            <div>
              <strong>Машин хасах</strong>
              <p>Жагсаалтаас нууж архивлана. Засварын түүх, хавсралт устахгүй.</p>
            </div>
            <button type="submit" className={styles.dangerButton}>
              <Trash2 size={16} aria-hidden />
              Хасах
            </button>
          </form>
        </section>
        ) : null}
      </section>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(modal, document.body);
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
  const pathname = usePathname() ?? "/auto-base";
  const searchParams = useSearchParams();
  const vehiclesById = useMemo(
    () => new Map(board.allVehicles.map((vehicle) => [vehicle.id, vehicle])),
    [board.allVehicles],
  );
  const initialVehicleFromQuery = vehicleIdFromParam(
    searchParamValue(searchParams, AUTO_BASE_QUERY_PARAMS.vehicle),
  );
  const initialSelectedVehicleId = initialVehicleFromQuery ?? initialVehicleId ?? null;
  const initialBucket = searchParamValue(searchParams, AUTO_BASE_QUERY_PARAMS.bucket);
  const initialStatus = searchParamValue(searchParams, AUTO_BASE_QUERY_PARAMS.status);
  const initialView = searchParamValue(searchParams, AUTO_BASE_QUERY_PARAMS.view);
  const initialSort = searchParamValue(searchParams, AUTO_BASE_QUERY_PARAMS.sort);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(
    initialSelectedVehicleId && vehiclesById.has(initialSelectedVehicleId)
      ? initialSelectedVehicleId
      : null,
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeFilter, setActiveFilter] = useState<VehicleFilterKey>(
    isVehicleFilterKey(initialBucket) ? initialBucket : "all",
  );
  const [activeCategoryKey, setActiveCategoryKey] = useState(
    searchParamValue(searchParams, AUTO_BASE_QUERY_PARAMS.category) || ALL_CATEGORY_KEY,
  );
  const [departmentFilterKey, setDepartmentFilterKey] = useState(
    searchParamValue(searchParams, AUTO_BASE_QUERY_PARAMS.department) || ALL_DEPARTMENT_KEY,
  );
  const [searchQuery, setSearchQuery] = useState(
    searchParamValue(searchParams, AUTO_BASE_QUERY_PARAMS.search),
  );
  const [statusFilter, setStatusFilter] = useState<VehicleStatusFilter>(
    isVehicleStatusFilter(initialStatus) ? initialStatus : "all",
  );
  const [viewMode, setViewMode] = useState<VehicleViewMode>(
    isVehicleViewMode(initialView) ? initialView : "grid",
  );
  const [sortMode, setSortMode] = useState<VehicleSortMode>(
    isVehicleSortMode(initialSort) ? initialSort : "status",
  );
  const [dismissedSystemNotice, setDismissedSystemNotice] = useState(false);
  const selectedVehicle = selectedVehicleId ? vehiclesById.get(selectedVehicleId) ?? null : null;
  const departmentFilters: VehicleCategoryFilter[] = (() => {
    const counts = new Map<string, number>();
    const options = new Map<string, VehicleCategoryFilter>();

    for (const vehicle of board.allVehicles) {
      const key = vehicleDepartmentKey(vehicle);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (key !== UNCATEGORIZED_DEPARTMENT_KEY && !options.has(key)) {
        options.set(key, {
          key,
          id: vehicle.departmentId,
          name: vehicle.departmentName || "Хэлтэсгүй",
          count: 0,
        });
      }
    }

    for (const option of board.departmentOptions) {
      const key = departmentOptionKey(option);
      if (!options.has(key)) {
        options.set(key, {
          key,
          id: option.id,
          name: option.name,
          count: 0,
        });
      }
    }

    const departmentItems = Array.from(options.values())
      .map((option) => ({
        ...option,
        count: counts.get(option.key) ?? 0,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));

    if (counts.has(UNCATEGORIZED_DEPARTMENT_KEY)) {
      departmentItems.push({
        key: UNCATEGORIZED_DEPARTMENT_KEY,
        id: null,
        name: "Хэлтэсгүй",
        count: counts.get(UNCATEGORIZED_DEPARTMENT_KEY) ?? 0,
      });
    }

    return [
      {
        key: ALL_DEPARTMENT_KEY,
        id: null,
        name: "Бүх хэлтэс",
        count: board.allVehicles.length,
      },
      ...departmentItems,
    ];
  })();
  const selectedDepartment =
    departmentFilters.find((department) => department.key === departmentFilterKey) ??
    departmentFilters[0];
  const departmentVehicles =
    selectedDepartment.key === ALL_DEPARTMENT_KEY
      ? board.allVehicles
      : board.allVehicles.filter(
          (vehicle) => vehicleDepartmentKey(vehicle) === selectedDepartment.key,
        );
  const categoryFilters: VehicleCategoryFilter[] = (() => {
    const counts = new Map<string, number>();
    const options = new Map<string, VehicleCategoryFilter>();
    const configuredOptions = board.vehicleTypeOptions.length
      ? board.vehicleTypeOptions.map((option) => ({ option, source: "type" as const }))
      : board.categoryOptions.map((option) => ({ option, source: "category" as const }));
    const configuredCategoryKeys = new Set(
      configuredOptions
        .filter(({ option }) => !isHiddenVehicleCategoryName(option.name))
        .map(({ option, source }) => categoryOptionKey(option, source)),
    );
    const hasConfiguredCategories = configuredCategoryKeys.size > 0;

    for (const vehicle of departmentVehicles) {
      if (
        isHiddenVehicleCategoryName(vehicle.vehicleTypeName) ||
        isHiddenVehicleCategoryName(vehicle.categoryName)
      ) {
        continue;
      }
      const key = vehicleCategoryKey(vehicle);
      if (
        hasConfiguredCategories &&
        key !== UNCATEGORIZED_CATEGORY_KEY &&
        !configuredCategoryKeys.has(key)
      ) {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (key !== UNCATEGORIZED_CATEGORY_KEY && !options.has(key)) {
        options.set(key, {
          key,
          id: vehicle.vehicleTypeId ?? vehicle.categoryId,
          name: vehicleCategoryName(vehicle) || "Ангилалгүй",
          count: 0,
        });
      }
    }

    for (const { option, source } of configuredOptions) {
      if (isHiddenVehicleCategoryName(option.name)) {
        continue;
      }
      const key = categoryOptionKey(option, source);
      if (!options.has(key)) {
        options.set(key, {
          key,
          id: option.id,
          name: option.name,
          count: 0,
        });
      }
    }

    const categoryItems = Array.from(options.values())
      .map((option) => ({
        ...option,
        count: counts.get(option.key) ?? 0,
      }))
      .sort((left, right) => {
        const rankDelta = preferredCategoryRank(left.name) - preferredCategoryRank(right.name);
        return rankDelta || left.name.localeCompare(right.name, "mn-MN");
      });

    if (counts.has(UNCATEGORIZED_CATEGORY_KEY)) {
      categoryItems.push({
        key: UNCATEGORIZED_CATEGORY_KEY,
        id: null,
        name: "Ангилалгүй",
        count: counts.get(UNCATEGORIZED_CATEGORY_KEY) ?? 0,
      });
    }

    return [
      {
        key: ALL_CATEGORY_KEY,
        id: null,
        name: "Бүгд",
        count: departmentVehicles.length,
      },
      ...categoryItems,
    ];
  })();
  const selectedCategory =
    categoryFilters.find((category) => category.key === activeCategoryKey) ?? categoryFilters[0];
  const categoryVehicles =
    selectedCategory.key === ALL_CATEGORY_KEY
      ? departmentVehicles
      : departmentVehicles.filter((vehicle) => vehicleCategoryKey(vehicle) === selectedCategory.key);
  const departmentSummary = {
    total: departmentVehicles.length,
    active: departmentVehicles.filter(
      (vehicle) => !vehicle.isRepair && vehicle.isOperational && !vehicle.isArchived,
    ).length,
    repair: departmentVehicles.filter((vehicle) => vehicle.isRepair).length,
    insurance: departmentVehicles.filter((vehicle) => vehicle.insurance.reminderDue).length,
    inspection: departmentVehicles.filter((vehicle) => vehicle.inspection.reminderDue).length,
  };
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("mn-MN");
  const searchedVehicles = categoryVehicles.filter((vehicle) => {
    const statusMatches = vehicleMatchesStatus(vehicle, statusFilter);
    const searchMatches =
      !normalizedSearchQuery || vehicleSearchText(vehicle).includes(normalizedSearchQuery);
    return statusMatches && searchMatches;
  });
  const categoryActiveVehicles = searchedVehicles.filter(
    (vehicle) => !vehicle.isRepair && vehicle.isOperational && !vehicle.isArchived,
  );
  const categoryRepairVehicles = searchedVehicles.filter((vehicle) => vehicle.isRepair);
  const categoryInsuranceDueVehicles = searchedVehicles.filter((vehicle) => vehicle.insurance.reminderDue);
  const categoryInspectionDueVehicles = searchedVehicles.filter((vehicle) => vehicle.inspection.reminderDue);
  const categoryInactiveVehicles = searchedVehicles.filter((vehicle) => !vehicle.isOperational || vehicle.isArchived);
  const buckets: BucketConfig[] = [
    {
      key: "all",
      title:
        selectedCategory.key === ALL_CATEGORY_KEY
          ? `Бүх машин техник (${searchedVehicles.length})`
          : `${selectedCategory.name} (${searchedVehicles.length})`,
      count: searchedVehicles.length,
      description: "",
      hint: "",
      emptyLabel: "Тохирох машин олдсонгүй.",
      vehicles: searchedVehicles,
      tone: "active",
    },
    {
      key: "active",
      title: "Ажиллаж байгаа машин",
      count: categoryActiveVehicles.length,
      description: "Бүрэн хүчин чадлаар ажиллаж байна",
      hint: "",
      emptyLabel: "Одоогоор ажиллаж байгаа машин алга.",
      vehicles: categoryActiveVehicles,
      tone: "active",
    },
    {
      key: "repair",
      title: "Засварт байгаа машин",
      count: categoryRepairVehicles.length,
      description: "Засвар үйлчилгээ хийгдэж байна",
      hint: "",
      emptyLabel: "Одоогоор засагдаж буй машин алга.",
      vehicles: categoryRepairVehicles,
      tone: "repair",
    },
    {
      key: "insurance",
      title: "Даатгал сануулах машин",
      count: categoryInsuranceDueVehicles.length,
      description: "Даатгалын хугацаа дуусах дөхсөн",
      hint: "",
      emptyLabel: "Одоогоор даатгал сануулах машин алга.",
      vehicles: categoryInsuranceDueVehicles,
      tone: "warning",
    },
    {
      key: "inspection",
      title: "Үзлэг сануулах машин",
      count: categoryInspectionDueVehicles.length,
      description: "Үзлэгийн хугацаа дуусах дөхсөн",
      hint: "",
      emptyLabel: "Одоогоор үзлэг сануулах машин алга.",
      vehicles: categoryInspectionDueVehicles,
      tone: "danger",
    },
    {
      key: "inactive",
      title: "Засвартай, ажиллах боломжгүй",
      count: categoryInactiveVehicles.length,
      description: "Ажиллах боломжгүй машин",
      hint: "",
      emptyLabel: "Одоогоор ажиллах боломжгүй машин алга.",
      vehicles: categoryInactiveVehicles,
      tone: "danger",
    },
  ];
  const selectedBucket = buckets.find((bucket) => bucket.key === activeFilter) ?? buckets[0];
  const statusOptions: Array<{ value: VehicleStatusFilter; label: string }> = [
    { value: "all", label: "Бүх төлөв" },
    { value: "active", label: "Ажиллаж байгаа" },
    { value: "warning", label: "Сануулгатай" },
    { value: "repair", label: "Засвартай" },
    { value: "inactive", label: "Идэвхгүй" },
  ];
  const visibleVehicles = [...selectedBucket.vehicles].sort((left, right) => {
    if (sortMode === "plate") {
      return left.plate.localeCompare(right.plate, "mn-MN");
    }
    if (sortMode === "deadline") {
      return earliestDeadlineDays(left) - earliestDeadlineDays(right);
    }
    return (
      statusSortRank(left) - statusSortRank(right) ||
      left.plate.localeCompare(right.plate, "mn-MN")
    );
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    setQueryParam(params, AUTO_BASE_QUERY_PARAMS.department, selectedDepartment.key, ALL_DEPARTMENT_KEY);
    setQueryParam(params, AUTO_BASE_QUERY_PARAMS.category, selectedCategory.key, ALL_CATEGORY_KEY);
    setQueryParam(params, AUTO_BASE_QUERY_PARAMS.bucket, selectedBucket.key, "all");
    setQueryParam(params, AUTO_BASE_QUERY_PARAMS.status, statusFilter, "all");
    setQueryParam(params, AUTO_BASE_QUERY_PARAMS.search, searchQuery);
    setQueryParam(params, AUTO_BASE_QUERY_PARAMS.view, viewMode, "grid");
    setQueryParam(params, AUTO_BASE_QUERY_PARAMS.sort, sortMode, "status");
    setQueryParam(
      params,
      AUTO_BASE_QUERY_PARAMS.vehicle,
      selectedVehicleId && vehiclesById.has(selectedVehicleId) ? String(selectedVehicleId) : "",
    );

    const query = params.toString();
    const nextUrl = `${pathname}${query ? `?${query}` : ""}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [
    activeFilter,
    pathname,
    searchQuery,
    selectedBucket.key,
    selectedCategory.key,
    selectedDepartment.key,
    selectedVehicleId,
    sortMode,
    statusFilter,
    vehiclesById,
    viewMode,
  ]);

  const applyMetricFilter = (filter: VehicleFilterKey) => {
    setActiveFilter(filter);
    setActiveCategoryKey(ALL_CATEGORY_KEY);
    setStatusFilter("all");
    setSearchQuery("");
  };
  const summaryStats: SummaryStat[] = [
    {
      key: "all",
      label: "Нийт машин техник",
      value: departmentSummary.total,
      helper: "Бүртгэлтэй",
      icon: Car,
      tone: "default",
    },
    {
      key: "active",
      label: "Ажиллаж байгаа",
      value: departmentSummary.active,
      helper: percentLabel(departmentSummary.active, departmentSummary.total),
      icon: CheckCircle2,
      tone: "active",
    },
    {
      key: "repair",
      label: "Засвартай",
      value: departmentSummary.repair,
      helper: percentLabel(departmentSummary.repair, departmentSummary.total),
      icon: Wrench,
      tone: "repair",
    },
    {
      key: "insurance",
      label: "Даатгал хугацаа болох",
      value: departmentSummary.insurance,
      helper: percentLabel(departmentSummary.insurance, departmentSummary.total),
      icon: AlertTriangle,
      tone: departmentSummary.insurance > 0 ? "warning" : "default",
    },
    {
      key: "inspection",
      label: "Үзлэг хугацаа болох",
      value: departmentSummary.inspection,
      helper: percentLabel(departmentSummary.inspection, departmentSummary.total),
      icon: CalendarCheck2,
      tone: departmentSummary.inspection > 0 ? "danger" : "default",
    },
  ];
  const notificationMessage = error || notice;
  const shouldShowNotice = Boolean(notificationMessage && !dismissedSystemNotice);

  return (
    <>
      {shouldShowNotice ? (
        <div
          className={cx(styles.vehicleNotice, error && styles.vehicleNoticeError)}
          role={error ? "alert" : "status"}
        >
          <span className={styles.vehicleNoticeIcon}>
            <CheckCircle2 size={17} aria-hidden />
          </span>
          <strong>{notificationMessage}</strong>
          {!error ? (
            <button
              type="button"
              className={styles.vehicleNoticeClose}
              onClick={() => setDismissedSystemNotice(true)}
              aria-label="Мэдэгдлийг хаах"
            >
              <X size={17} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.vehicleBoardActions}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => setShowCreateForm((value) => !value)}
        >
          <Plus size={16} aria-hidden />
          Машин нэмэх
        </button>
      </div>

      {showCreateForm ? (
        <NewVehicleForm
          modelOptions={board.modelOptions}
          vehicleTypeOptions={board.vehicleTypeOptions}
          categoryOptions={board.categoryOptions}
          departmentOptions={board.departmentOptions}
          onCancel={() => setShowCreateForm(false)}
        />
      ) : null}

      <div className={styles.metricGrid}>
        {summaryStats.map((item) => {
          const Icon = item.icon;
          const isSelected = selectedBucket.key === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={cx(
                styles.metricTile,
                styles[`metricTile_${item.tone}`],
                isSelected && styles.metricTileSelected,
              )}
              aria-pressed={isSelected}
              onClick={() => applyMetricFilter(item.key)}
            >
              <span className={styles.summaryIcon}>
                <Icon size={22} aria-hidden />
              </span>
              <div className={styles.metricCopy}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.helper}</small>
              </div>
            </button>
          );
        })}
      </div>

      <section className={styles.vehicleFilterBoard} data-testid="vehicle-filter-board">
        <div className={styles.vehicleFilterCard}>
          <div className={styles.vehicleFilterToolbar}>
            <label className={styles.vehicleSelectField}>
              <span>Хэлтэс</span>
              <Building2 size={17} className={styles.vehicleFieldLeadingIcon} aria-hidden />
              <select
                value={selectedDepartment.key}
                onChange={(event) => {
                  setDepartmentFilterKey(event.target.value);
                  setActiveCategoryKey(ALL_CATEGORY_KEY);
                  setActiveFilter("all");
                  setStatusFilter("all");
                }}
              >
                {departmentFilters.map((department) => (
                  <option key={department.key} value={department.key}>
                    {`${department.name} (${department.count})`}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.vehicleSelectField}>
              <span>Машины төрөл</span>
              <Truck size={17} className={styles.vehicleFieldLeadingIcon} aria-hidden />
              <select
                value={selectedCategory.key}
                onChange={(event) => {
                  setActiveCategoryKey(event.target.value);
                  setActiveFilter("all");
                }}
              >
                {categoryFilters.map((category) => (
                  <option key={category.key} value={category.key}>
                    {`${category.name} (${category.count})`}
                  </option>
                ))}
              </select>
            </label>
            <label className={cx(styles.vehicleSelectField, styles.vehicleSelectFieldPlain)}>
              <span>Төлөв</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as VehicleStatusFilter);
                  setActiveFilter("all");
                }}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.vehicleSearchField}>
              <span>Хайлт</span>
              <Search size={18} className={styles.vehicleFieldLeadingIcon} aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Улсын дугаар, жолооч, загвар..."
                aria-label="Машин хайх"
              />
            </label>
          </div>

        </div>

        <section
          className={cx(
            styles.vehicleFilterPanel,
            selectedBucket.tone === "repair"
              ? styles.vehicleFilterPanelRepair
              : selectedBucket.tone === "warning"
                ? styles.vehicleFilterPanelWarning
                : selectedBucket.tone === "danger"
                  ? styles.vehicleFilterPanelDanger
                  : styles.vehicleFilterPanelActive,
          )}
          role="tabpanel"
        >
          <div className={styles.vehicleFilterPanelHeader}>
            <h2>{selectedBucket.title}</h2>
            <div className={styles.vehicleListTools}>
              <div className={styles.vehicleViewToggle} aria-label="Харагдац сонгох">
                <button
                  type="button"
                  className={cx(styles.vehicleViewButton, viewMode === "grid" && styles.vehicleViewButtonActive)}
                  onClick={() => setViewMode("grid")}
                  aria-pressed={viewMode === "grid"}
                >
                  <Grid3X3 size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  className={cx(styles.vehicleViewButton, viewMode === "list" && styles.vehicleViewButtonActive)}
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                >
                  <List size={18} aria-hidden />
                </button>
              </div>
              <label className={styles.vehicleSortField}>
                <span>Эрэмбэлэх</span>
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as VehicleSortMode)}
                >
                  <option value="status">Төлөвөөр</option>
                  <option value="deadline">Хугацаа ойр</option>
                  <option value="plate">Улсын дугаараар</option>
                </select>
                <ChevronDown size={15} className={styles.vehicleFieldChevron} aria-hidden />
              </label>
            </div>
          </div>

          <VehicleList
            vehicles={visibleVehicles}
            emptyLabel={selectedBucket.emptyLabel}
            viewMode={viewMode}
            onSelectVehicle={(vehicle) => {
              setShowCreateForm(false);
              setSelectedVehicleId(vehicle.id);
            }}
          />
        </section>
      </section>

      {selectedVehicle ? (
        <VehicleDetailModal
          vehicle={selectedVehicle}
          driverOptions={board.driverOptions}
          loaderOptions={board.loaderOptions}
          departmentOptions={board.departmentOptions}
          modelOptions={board.modelOptions}
          vehicleTypeOptions={board.vehicleTypeOptions}
          categoryOptions={board.categoryOptions}
          onClose={() => {
            setSelectedVehicleId(null);
          }}
        />
      ) : null}
    </>
  );
}
