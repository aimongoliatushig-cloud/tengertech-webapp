"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  Layers3,
  ListChecks,
  MapPin,
  Paperclip,
  Sparkles,
  Trash2,
  Truck,
  UserCheck,
  Wrench,
} from "lucide-react";

import styles from "@/app/workspace.module.css";
import type {
  DepartmentOption,
  GarbagePointOption,
  GarbageSubdistrictOption,
  GarbageVehicleOption,
  RoadCleaningAreaOption,
  RoadCleaningEmployeeOption,
  SelectOption,
} from "@/lib/workspace";

const GARBAGE_TRANSPORT_KEYWORD = "хог тээвэрлэлтийн";
const AUTO_BASE_KEYWORD = "авто бааз";
const GREEN_SERVICE_KEYWORDS = ["ногоон", "цэвэрлэгээ", "зам талбай"];
const ROAD_CLEANING_EMPLOYEE_DEPARTMENT_KEYWORDS = [
  "ногоон",
  "цэвэрлэгээ үйлчилгээний хэлтэс",
];
const ROAD_CLEANING_EMPLOYEE_JOB_KEYWORD = "зам талбайн үйлчлэгч";
const ROAD_CLEANING_MASTER_JOB_KEYWORDS = ["мастер", "зам талбайн ахлах мастер"];
const WEEKDAY_OPTIONS = [
  { key: "monday", label: "Даваа" },
  { key: "tuesday", label: "Мягмар" },
  { key: "wednesday", label: "Лхагва" },
  { key: "thursday", label: "Пүрэв" },
  { key: "friday", label: "Баасан" },
  { key: "saturday", label: "Бямба" },
  { key: "sunday", label: "Ням" },
] as const;

type RoadCleaningLineDraft = {
  id: string;
  cleaningAreaId: string;
  employeeId: string;
  newAreaName: string;
  newAreaM2: string;
  showNewArea: boolean;
};

type AutoBaseLineDraft = {
  id: string;
  itemName: string;
  description: string;
  quantity: string;
  unitPrice: string;
  imagePreviews: FilePreview[];
};

const CUSTOM_WORK_TYPE_VALUE = "__new_work__";
type FilePreview = {
  name: string;
  type: string;
  url: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  departmentOptions: DepartmentOption[];
  managerOptions: SelectOption[];
  garbageVehicleOptions: GarbageVehicleOption[];
  garbagePointOptions: GarbagePointOption[];
  garbageSubdistrictOptions?: GarbageSubdistrictOption[];
  roadCleaningAreaOptions: RoadCleaningAreaOption[];
  roadCleaningEmployeeOptions: RoadCleaningEmployeeOption[];
  lockedDepartmentId?: string;
  lockedDepartmentLabel?: string;
  initialDepartmentId?: string;
  initialGarbageVehicleId?: string;
  initialGarbageShiftDate?: string;
  currentUserId?: number;
  lockRoadCleaningMasterToCurrentUser?: boolean;
  disableSharedWork?: boolean;
};

function SubmitWorkButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={`${styles.primaryButton} ${pending ? styles.primaryButtonPending : ""}`}
      disabled={pending}
      aria-busy={pending}
    >
      <span className={styles.submitSpinner} aria-hidden />
      <span>{pending ? "Уншиж байна..." : label}</span>
    </button>
  );
}

function getTodayValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  if (!value) {
    return "Огноо сонгоно уу";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const monthNames = [
    "нэгдүгээр сар",
    "хоёрдугаар сар",
    "гуравдугаар сар",
    "дөрөвдүгээр сар",
    "тавдугаар сар",
    "зургаадугаар сар",
    "долдугаар сар",
    "наймдугаар сар",
    "есдүгээр сар",
    "аравдугаар сар",
    "арван нэгдүгээр сар",
    "арван хоёрдугаар сар",
  ];

  return `${parsed.getFullYear()} оны ${monthNames[parsed.getMonth()]}ын ${parsed.getDate()}`;
}

function normalizeDepartmentValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function departmentContains(
  department: Pick<DepartmentOption, "name" | "label"> | null | undefined,
  keyword: string,
) {
  const normalizedKeyword = normalizeDepartmentValue(keyword);
  return [department?.name, department?.label].some((value) =>
    normalizeDepartmentValue(value).includes(normalizedKeyword),
  );
}

function isGarbageTransportDepartment(
  department: Pick<DepartmentOption, "name" | "label"> | null | undefined,
) {
  return departmentContains(department, GARBAGE_TRANSPORT_KEYWORD);
}

function isGreenServiceDepartment(
  department: Pick<DepartmentOption, "name" | "label"> | null | undefined,
) {
  return GREEN_SERVICE_KEYWORDS.some((keyword) => departmentContains(department, keyword));
}

function isCombinedOperationsDepartment(
  department: Pick<DepartmentOption, "name" | "label"> | null | undefined,
) {
  return (
    departmentContains(department, GARBAGE_TRANSPORT_KEYWORD) &&
    departmentContains(department, AUTO_BASE_KEYWORD)
  );
}

function isRoadCleaningServiceEmployee(employee: RoadCleaningEmployeeOption) {
  const departmentName = normalizeDepartmentValue(employee.departmentName);
  const jobTitle = normalizeDepartmentValue(employee.jobTitle);

  return (
    ROAD_CLEANING_EMPLOYEE_DEPARTMENT_KEYWORDS.every((keyword) =>
      departmentName.includes(keyword),
    ) && jobTitle.includes(ROAD_CLEANING_EMPLOYEE_JOB_KEYWORD)
  );
}

function isRoadCleaningMasterEmployee(employee: RoadCleaningEmployeeOption) {
  const departmentName = normalizeDepartmentValue(employee.departmentName);
  const jobTitle = normalizeDepartmentValue(employee.jobTitle);

  return (
    ROAD_CLEANING_EMPLOYEE_DEPARTMENT_KEYWORDS.every((keyword) =>
      departmentName.includes(keyword),
    ) &&
    ROAD_CLEANING_MASTER_JOB_KEYWORDS.some(
      (keyword) => jobTitle === keyword || jobTitle.includes(keyword),
    )
  );
}

function roadCleaningMasterRoleLabel(employee: RoadCleaningEmployeeOption) {
  return normalizeDepartmentValue(employee.jobTitle).includes("ахлах мастер")
    ? "Ахлах мастер"
    : "Мастер";
}

function emptyRoadCleaningLine(index: number, stableInitial = false): RoadCleaningLineDraft {
  return {
    id: `road-cleaning-line-${index}-${stableInitial ? "initial" : Date.now()}`,
    cleaningAreaId: "",
    employeeId: "",
    newAreaName: "",
    newAreaM2: "",
    showNewArea: false,
  };
}

function emptyAutoBaseLine(index: number): AutoBaseLineDraft {
  return {
    id: `auto-base-line-${index}-${Date.now()}`,
    itemName: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    imagePreviews: [],
  };
}

export function NewWorkForm({
  action,
  departmentOptions,
  managerOptions,
  garbageVehicleOptions,
  garbagePointOptions,
  garbageSubdistrictOptions: activeSubdistrictOptions = [],
  roadCleaningAreaOptions,
  roadCleaningEmployeeOptions,
  lockedDepartmentId,
  lockedDepartmentLabel,
  initialDepartmentId,
  initialGarbageVehicleId,
  initialGarbageShiftDate,
  currentUserId,
  lockRoadCleaningMasterToCurrentUser = false,
  disableSharedWork = false,
}: Props) {
  const defaultDepartmentId = lockedDepartmentId ?? initialDepartmentId ?? "";
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId);
  const [operationUnit, setOperationUnit] = useState(() => {
    const initialDepartment = departmentOptions.find(
      (option) => String(option.id) === defaultDepartmentId,
    );

    if (isGarbageTransportDepartment(initialDepartment)) {
      return "garbage_transport";
    }

    if (isGreenServiceDepartment(initialDepartment)) {
      return "road_area_cleaning";
    }

    return "standard";
  });
  const [vehicleId, setVehicleId] = useState(initialGarbageVehicleId ?? "");
  const [autoBaseVehicleId, setAutoBaseVehicleId] = useState("");
  const [autoBaseItemName, setAutoBaseItemName] = useState("");
  const [autoBaseQuantity, setAutoBaseQuantity] = useState("1");
  const [autoBaseUnitPrice, setAutoBaseUnitPrice] = useState("");
  const [autoBaseLines, setAutoBaseLines] = useState<AutoBaseLineDraft[]>([]);
  const autoBaseLinesRef = useRef(autoBaseLines);
  const [garbageSubdistrictId, setGarbageSubdistrictId] = useState("");
  const [selectedGarbagePointIds, setSelectedGarbagePointIds] = useState<string[]>([]);
  const [selectedLoaderIds, setSelectedLoaderIds] = useState<string[]>([]);
  const [cleaningWorkDate, setCleaningWorkDate] = useState(getTodayValue());
  const [cleaningMasterId, setCleaningMasterId] = useState("");
  const [roadCleaningLines, setRoadCleaningLines] = useState<RoadCleaningLineDraft[]>([
    emptyRoadCleaningLine(0, true),
  ]);
  const [roadCleaningAreaChoices, setRoadCleaningAreaChoices] = useState(roadCleaningAreaOptions);
  const [roadCleaningAreaError, setRoadCleaningAreaError] = useState("");
  const [savingRoadCleaningAreaId, setSavingRoadCleaningAreaId] = useState("");
  const [shiftDate, setShiftDate] = useState(initialGarbageShiftDate ?? getTodayValue());
  const [seasonalStartDate, setSeasonalStartDate] = useState(getTodayValue());
  const [autoBaseImagePreviews, setAutoBaseImagePreviews] = useState<FilePreview[]>([]);
  const [projectFilePreviews, setProjectFilePreviews] = useState<FilePreview[]>([]);
  const [sharedDepartmentIds, setSharedDepartmentIds] = useState<string[]>([]);
  const [greenWorkflowStep, setGreenWorkflowStep] = useState<"select" | "form">("select");

  const selectedDepartment = useMemo(
    () => departmentOptions.find((option) => String(option.id) === departmentId) ?? null,
    [departmentId, departmentOptions],
  );
  const sharedDepartmentOptions = useMemo(
    () =>
      departmentOptions.filter((option) => String(option.id) !== departmentId || operationUnit === "shared_work"),
    [departmentId, departmentOptions, operationUnit],
  );

  useEffect(() => {
    autoBaseLinesRef.current = autoBaseLines;
  }, [autoBaseLines]);
  useEffect(
    () => () => {
      autoBaseLinesRef.current.forEach((line) =>
        line.imagePreviews.forEach((file) => URL.revokeObjectURL(file.url)),
      );
    },
    [],
  );
  useEffect(
    () => () => {
      autoBaseImagePreviews.forEach((file) => URL.revokeObjectURL(file.url));
    },
    [autoBaseImagePreviews],
  );
  useEffect(
    () => () => {
      projectFilePreviews.forEach((file) => URL.revokeObjectURL(file.url));
    },
    [projectFilePreviews],
  );
  const selectedDepartmentHead = useMemo(() => {
    const departmentHeadOptions = managerOptions.filter(
      (option) => option.role === "project_manager",
    );

    if (!selectedDepartment) {
      return departmentHeadOptions.length === 1 ? departmentHeadOptions[0] : null;
    }

    const selectedDepartmentNames = [selectedDepartment.name, selectedDepartment.label]
      .map(normalizeDepartmentValue)
      .filter(Boolean);
    const matchingDepartmentHead = departmentHeadOptions.find((option) => {
      const managerDepartmentName = normalizeDepartmentValue(option.departmentName);
      if (!managerDepartmentName) {
        return false;
      }

      return selectedDepartmentNames.some(
        (departmentName) =>
          managerDepartmentName === departmentName ||
          managerDepartmentName.includes(departmentName) ||
          departmentName.includes(managerDepartmentName),
      );
    });

    return matchingDepartmentHead ?? (departmentHeadOptions.length === 1 ? departmentHeadOptions[0] : null);
  }, [managerOptions, selectedDepartment]);
  const selectedVehicle = useMemo(
    () => garbageVehicleOptions.find((option) => String(option.id) === vehicleId) ?? null,
    [garbageVehicleOptions, vehicleId],
  );
  useEffect(() => {
    setSelectedLoaderIds((selectedVehicle?.loaderIds ?? []).map(String));
  }, [selectedVehicle]);
  const loaderEmployeeOptions = useMemo(() => {
    const selectedLoaderIdSet = new Set(selectedLoaderIds);
    return roadCleaningEmployeeOptions.filter((employee) => {
      const normalizedJob = normalizeDepartmentValue(employee.jobTitle);
      const normalizedDepartment = normalizeDepartmentValue(employee.departmentName);
      return (
        selectedLoaderIdSet.has(String(employee.id)) ||
        normalizedJob.includes("ачигч") ||
        (normalizedDepartment.includes("хог") && normalizedJob.includes("тээвэр"))
      );
    });
  }, [roadCleaningEmployeeOptions, selectedLoaderIds]);
  const loaderEmployeeById = useMemo(
    () => new Map(loaderEmployeeOptions.map((employee) => [String(employee.id), employee])),
    [loaderEmployeeOptions],
  );
  const selectedLoaderLabels = selectedLoaderIds.map((loaderId, index) => {
    const employee = loaderEmployeeById.get(loaderId);
    return employee?.name ?? selectedVehicle?.loaderNames?.[index] ?? `Ачигч #${loaderId}`;
  });
  const selectedAutoBaseVehicle = useMemo(
    () => garbageVehicleOptions.find((option) => String(option.id) === autoBaseVehicleId) ?? null,
    [autoBaseVehicleId, garbageVehicleOptions],
  );
  const garbageSubdistrictOptions = useMemo(() => {
    const optionMap = new Map<string, { id: string; label: string }>();
    for (const point of garbagePointOptions) {
      const id = point.subdistrictId ? String(point.subdistrictId) : "none";
      const label = point.subdistrictName || "Хороо сонгоогүй";
      if (!optionMap.has(id)) {
        optionMap.set(id, { id, label });
      }
    }
    return Array.from(optionMap.values());
  }, [garbagePointOptions]);
  const filteredGarbagePointOptions = useMemo(() => {
    if (!garbageSubdistrictId) {
      return [];
    }
    return garbagePointOptions.filter((point) =>
      garbageSubdistrictId === "none"
        ? !point.subdistrictId
        : String(point.subdistrictId) === garbageSubdistrictId,
    );
  }, [garbagePointOptions, garbageSubdistrictId]);
  const selectedGarbagePoints = useMemo(
    () => garbagePointOptions.filter((point) => selectedGarbagePointIds.includes(String(point.id))),
    [garbagePointOptions, selectedGarbagePointIds],
  );
  const isCombinedDepartment = isCombinedOperationsDepartment(selectedDepartment);
  const supportsGarbageTransport = isGarbageTransportDepartment(selectedDepartment);
  const supportsRoadAreaCleaning = isGreenServiceDepartment(selectedDepartment);
  const isGarbageTransport =
    supportsGarbageTransport && operationUnit === "garbage_transport";
  const isAutoBase =
    supportsGarbageTransport && operationUnit === "auto_base";
  const isSeasonalGarbage =
    supportsGarbageTransport && operationUnit === "garbage_seasonal";
  const isRoadAreaCleaning =
    supportsRoadAreaCleaning && operationUnit === "road_area_cleaning";
  const isSharedWork = operationUnit === "shared_work";
  const isDepartmentLocked = Boolean(lockedDepartmentId);
  const canCreateSharedWork = !disableSharedWork;
  const showRoadCleaningModePicker =
    supportsRoadAreaCleaning && !isSharedWork;
  const visibleRoadCleaningAreaChoices = useMemo(() => {
    if (!selectedDepartment) {
      return roadCleaningAreaChoices;
    }

    const departmentAreaChoices = roadCleaningAreaChoices.filter(
      (area) => !area.departmentId || area.departmentId === selectedDepartment.id,
    );

    return departmentAreaChoices.length ? departmentAreaChoices : roadCleaningAreaChoices;
  }, [roadCleaningAreaChoices, selectedDepartment]);

  const submitLabel = isSharedWork
    ? "Хамтарсан ажил үүсгэх"
    : isGarbageTransport
    ? "Хог тээвэрлэлтийн ажил үүсгэх"
    : isAutoBase
      ? "Авто баазын ажил үүсгэх"
    : isSeasonalGarbage
      ? "Гэнэтийн ажил үүсгэх"
      : isRoadAreaCleaning
        ? "Зам талбайн цэвэрлэгээний ажил үүсгэх"
      : "Ажил үүсгэх";

  const generatedName = useMemo(() => {
    if (!isGarbageTransport) {
      return "";
    }

    const vehicleLabel = selectedVehicle?.plate || "Машины дугаар";
    const selectedSubdistrictLabel =
      garbageSubdistrictOptions.find((option) => option.id === garbageSubdistrictId)?.label ??
      "Хороо";
    const primaryLocationLabel = selectedGarbagePoints.length
      ? `${selectedSubdistrictLabel} / ${selectedGarbagePoints.length} цэг`
      : selectedSubdistrictLabel;
    return `${vehicleLabel} - ${primaryLocationLabel} / ${shiftDate}`;
  }, [
    garbageSubdistrictId,
    garbageSubdistrictOptions,
    isGarbageTransport,
    selectedGarbagePoints.length,
    selectedVehicle,
    shiftDate,
  ]);
  const autoBaseTotalPrice = useMemo(() => {
    const primaryTotal = (Number(autoBaseQuantity) || 0) * (Number(autoBaseUnitPrice) || 0);
    return autoBaseLines.reduce((total, line) => {
      const quantity = Number(line.quantity) || 0;
      const unitPrice = Number(line.unitPrice) || 0;
      return total + quantity * unitPrice;
    }, primaryTotal);
  }, [autoBaseLines, autoBaseQuantity, autoBaseUnitPrice]);
  const activeAutoBaseLines = autoBaseLines.filter(
    (line) =>
      line.itemName.trim() ||
      line.description.trim() ||
      line.unitPrice.trim() ||
      line.imagePreviews.length,
  );
  const autoBaseRequestTitle = useMemo(() => {
    const vehicleLabel = selectedAutoBaseVehicle?.plate || selectedAutoBaseVehicle?.label || "Машин";
    const namedLines = [autoBaseItemName, ...autoBaseLines.map((line) => line.itemName)]
      .map((itemName) => itemName.trim())
      .filter(Boolean);
    const itemLabel =
      namedLines.length > 1
        ? `${namedLines.length} төрлийн сэлбэг`
        : namedLines[0] || "авах зүйл";
    return `${vehicleLabel} - ${itemLabel}`;
  }, [autoBaseItemName, autoBaseLines, selectedAutoBaseVehicle]);
  const handleDepartmentChange = (nextDepartmentId: string) => {
    setDepartmentId(nextDepartmentId);
    const nextDepartment = departmentOptions.find(
      (option) => String(option.id) === nextDepartmentId,
    );

    if (isGarbageTransportDepartment(nextDepartment)) {
      setOperationUnit("garbage_transport");
      return;
    }

    if (isGreenServiceDepartment(nextDepartment)) {
      setOperationUnit("road_area_cleaning");
      return;
    }

    setOperationUnit("standard");
  };

  const handleGarbageSubdistrictChange = (nextSubdistrictId: string) => {
    setGarbageSubdistrictId(nextSubdistrictId);
    setSelectedGarbagePointIds([]);
  };

  const toggleGarbagePoint = (pointId: number) => {
    const value = String(pointId);
    setSelectedGarbagePointIds((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const addLoader = (loaderId: string) => {
    if (!loaderId) {
      return;
    }
    setSelectedLoaderIds((current) => (
      current.includes(loaderId) ? current : [...current, loaderId]
    ));
  };

  const removeLoader = (loaderId: string) => {
    setSelectedLoaderIds((current) => current.filter((item) => item !== loaderId));
  };

  const updateAutoBaseLine = (
    targetId: string,
    key: keyof Omit<AutoBaseLineDraft, "id" | "imagePreviews">,
    value: string,
  ) => {
    setAutoBaseLines((current) =>
      current.map((line) => (line.id === targetId ? { ...line, [key]: value } : line)),
    );
  };

  const updateAutoBaseLineImages = (targetId: string, files: FileList | null) => {
    const nextPreviews = Array.from(files ?? []).map((file) => ({
      name: file.name,
      type: file.type,
      url: URL.createObjectURL(file),
    }));

    setAutoBaseLines((current) =>
      current.map((line) => {
        if (line.id !== targetId) {
          return line;
        }
        line.imagePreviews.forEach((file) => URL.revokeObjectURL(file.url));
        return { ...line, imagePreviews: nextPreviews };
      }),
    );
  };

  const removeAutoBaseLine = (targetId: string) => {
    setAutoBaseLines((current) => {
      if (current.length <= 1) {
        return current;
      }
      const removedLine = current.find((line) => line.id === targetId);
      removedLine?.imagePreviews.forEach((file) => URL.revokeObjectURL(file.url));
      return current.filter((line) => line.id !== targetId);
    });
  };

  const getRoadCleaningArea = (line: RoadCleaningLineDraft) =>
    roadCleaningAreaChoices.find((option) => String(option.id) === line.cleaningAreaId) ??
    null;

  const getRoadCleaningEmployeeChoices = (line: RoadCleaningLineDraft) => {
    const roadCleaningEmployees = roadCleaningEmployeeOptions.filter(
      isRoadCleaningServiceEmployee,
    );

    if (!line.cleaningAreaId) {
      const departmentEmployees = selectedDepartment
        ? roadCleaningEmployees.filter((employee) => employee.departmentId === selectedDepartment.id)
        : [];

      return departmentEmployees.length ? departmentEmployees : roadCleaningEmployees;
    }

    const lineArea = getRoadCleaningArea(line);
    const areaDepartmentEmployees = roadCleaningEmployees.filter(
      (employee) => employee.departmentId === lineArea?.departmentId,
    );

    return areaDepartmentEmployees.length ? areaDepartmentEmployees : roadCleaningEmployees;
  };

  const getRoadCleaningEmployee = (employeeId: string) =>
    roadCleaningEmployeeOptions.find((employee) => String(employee.id) === employeeId) ??
    null;

  const roadCleaningMasterChoices = useMemo(() => {
    const masterEmployees = roadCleaningEmployeeOptions.filter(isRoadCleaningMasterEmployee);
    const departmentMasters = selectedDepartment
      ? masterEmployees.filter((employee) => employee.departmentId === selectedDepartment.id)
      : [];
    const source = selectedDepartment && departmentMasters.length ? departmentMasters : masterEmployees;

    return [...source].sort((left, right) => {
      const roleDiff =
        (roadCleaningMasterRoleLabel(left) === "Ахлах мастер" ? 0 : 1) -
        (roadCleaningMasterRoleLabel(right) === "Ахлах мастер" ? 0 : 1);
      if (roleDiff !== 0) {
        return roleDiff;
      }
      return left.name.localeCompare(right.name, "mn");
    });
  }, [roadCleaningEmployeeOptions, selectedDepartment]);
  const currentRoadCleaningMaster = useMemo(() => {
    if (!lockRoadCleaningMasterToCurrentUser || !currentUserId) {
      return null;
    }

    return (
      roadCleaningMasterChoices.find((employee) => employee.userId === currentUserId) ??
      roadCleaningEmployeeOptions.find(
        (employee) => employee.userId === currentUserId && isRoadCleaningMasterEmployee(employee),
      ) ??
      null
    );
  }, [
    currentUserId,
    lockRoadCleaningMasterToCurrentUser,
    roadCleaningEmployeeOptions,
    roadCleaningMasterChoices,
  ]);
  const lockedCleaningMasterId = currentRoadCleaningMaster
    ? String(currentRoadCleaningMaster.id)
    : "";
  const effectiveCleaningMasterId = lockedCleaningMasterId || cleaningMasterId;

  useEffect(() => {
    if (lockedCleaningMasterId && cleaningMasterId !== lockedCleaningMasterId) {
      setCleaningMasterId(lockedCleaningMasterId);
    }
  }, [cleaningMasterId, lockedCleaningMasterId]);

  const selectedCleaningMaster =
    roadCleaningMasterChoices.find(
      (employee) => String(employee.id) === effectiveCleaningMasterId,
    ) ??
    currentRoadCleaningMaster ??
    null;
  const roadCleaningReadyLineCount = roadCleaningLines.filter((line) => {
    const hasArea = Boolean(line.cleaningAreaId || line.newAreaName.trim());
    return hasArea && Boolean(line.employeeId);
  }).length;
  const getRoadCleaningLineAreaM2 = (line: RoadCleaningLineDraft) => {
    const lineArea = getRoadCleaningArea(line);
    return Number(lineArea?.areaM2 ?? line.newAreaM2) || 0;
  };
  const roadCleaningTotalAreaM2 = roadCleaningLines.reduce(
    (total, line) => total + getRoadCleaningLineAreaM2(line),
    0,
  );
  const roadCleaningNotificationPeople = [
    selectedCleaningMaster?.name,
    selectedDepartmentHead?.name,
    "Системийн админ",
  ].filter(Boolean);
  const roadCleaningAutoTasks = [
    "Явган зам цэвэрлэх",
    "Замын нүх цэвэрлэх",
    "Хогийн сав шалгах",
    "Жижиг хог / шарилж / зарын хуудас цэвэрлэх",
  ];

  const getRoadCleaningWorkName = (line: RoadCleaningLineDraft) => {
    const lineArea = getRoadCleaningArea(line);
    const lineEmployee = getRoadCleaningEmployee(line.employeeId);
    const areaName = lineArea?.name || line.newAreaName.trim();

    if (!areaName || !lineEmployee || !cleaningWorkDate) {
      return "";
    }

    return `${areaName} - ${lineEmployee.name} - ${cleaningWorkDate}`;
  };

  const updateRoadCleaningLine = (
    targetId: string,
    key: keyof Omit<RoadCleaningLineDraft, "id">,
    value: string | boolean,
  ) => {
    if (key === "cleaningAreaId" && typeof value === "string" && !effectiveCleaningMasterId) {
      const nextArea =
        roadCleaningAreaChoices.find((option) => String(option.id) === value) ?? null;
      if (nextArea?.masterId) {
        setCleaningMasterId(String(nextArea.masterId));
      }
    }

    setRoadCleaningLines((current) =>
      current.map((line) => {
        if (line.id !== targetId) {
          return line;
        }

        const nextLine = { ...line, [key]: value };
        if (key === "cleaningAreaId") {
          const nextArea =
            roadCleaningAreaChoices.find((option) => String(option.id) === value) ?? null;
          nextLine.employeeId = nextArea?.employeeId
            ? String(nextArea.employeeId)
            : nextLine.employeeId;
          nextLine.newAreaName = "";
          nextLine.newAreaM2 = "";
          nextLine.showNewArea = false;
        }
        if (key === "showNewArea" && value) {
          nextLine.cleaningAreaId = "";
        }

        return nextLine;
      }),
    );
  };

  const removeRoadCleaningLine = (targetId: string) => {
    setRoadCleaningLines((current) => {
      if (current.length <= 1) {
        return [emptyRoadCleaningLine(0)];
      }

      return current.filter((line) => line.id !== targetId);
    });
  };

  const createRoadCleaningAreaFromLine = async (targetId: string) => {
    const targetLine = roadCleaningLines.find((line) => line.id === targetId);
    const areaName = targetLine?.newAreaName.trim() ?? "";
    if (!targetLine || !areaName) {
      setRoadCleaningAreaError("Цэвэрлэх талбайн нэр оруулна уу.");
      return;
    }

    setRoadCleaningAreaError("");
    setSavingRoadCleaningAreaId(targetId);
    try {
      const selectedMaster = roadCleaningEmployeeOptions.find(
        (employee) => String(employee.id) === effectiveCleaningMasterId,
      );
      const selectedEmployee = roadCleaningEmployeeOptions.find(
        (employee) => String(employee.id) === targetLine.employeeId,
      );
      const response = await fetch("/api/road-cleaning/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: areaName,
          departmentId: selectedDepartment?.id ?? null,
          departmentName: selectedDepartment?.name ?? selectedDepartment?.label ?? "",
          masterId: effectiveCleaningMasterId ? Number(effectiveCleaningMasterId) : null,
          masterName: selectedMaster?.name ?? "",
          employeeId: targetLine.employeeId ? Number(targetLine.employeeId) : null,
          employeeName: selectedEmployee?.name ?? "",
          areaM2: Number(targetLine.newAreaM2) || null,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        area?: RoadCleaningAreaOption;
        error?: string;
      } | null;

      if (!response.ok || !payload?.area) {
        throw new Error(payload?.error || "Цэвэрлэх талбай нэмэхэд алдаа гарлаа.");
      }

      const savedArea = payload.area;
      setRoadCleaningAreaChoices((current) => {
        const exists = current.some((area) => area.id === savedArea.id);
        return exists ? current : [...current, savedArea].sort((left, right) =>
          left.name.localeCompare(right.name, "mn"),
        );
      });
      setRoadCleaningLines((current) =>
        current.map((line) =>
          line.id === targetId
            ? {
                ...line,
                cleaningAreaId: String(savedArea.id),
                newAreaName: "",
                newAreaM2: "",
                showNewArea: false,
              }
            : line,
        ),
      );
    } catch (error) {
      setRoadCleaningAreaError(
        error instanceof Error ? error.message : "Цэвэрлэх талбай нэмэхэд алдаа гарлаа.",
      );
    } finally {
      setSavingRoadCleaningAreaId("");
    }
  };

  const formModeLabel = isGarbageTransport
    ? "Хог тээвэрлэлтийн цэгүүд"
    : isSharedWork
      ? "Хамтарсан ажил"
    : isSeasonalGarbage
      ? "Гэнэтийн ажил"
      : isRoadAreaCleaning
        ? "Зам талбайн цэвэрлэгээ"
      : "Ерөнхий ажил";
  const showProjectDetails = !isGarbageTransport && !isAutoBase && !isSeasonalGarbage && !isRoadAreaCleaning;
  const showGreenWorkflowSelector = supportsRoadAreaCleaning && !isSharedWork;
  const isGreenWorkflowSelectScreen = showGreenWorkflowSelector && greenWorkflowStep === "select";
  const mobileScreenTitle = isGreenWorkflowSelectScreen
    ? "Ажил нэмэх"
    : isRoadAreaCleaning
      ? "Хурдан үүсгэх"
      : "Ногоон байгууламжийн ажил";
  const formModeDescription = isGarbageTransport
    ? "Машин, хороо, огноо, олон хогийн цэг сонгоход тухайн өдрийн даалгавар автоматаар үүснэ."
    : isSharedWork
      ? "Олон хэлтэс сонгоход нэг мастер хамтарсан ажил үүсэж, хэлтэс бүр дээр өөрийн хариуцах ажил автоматаар үүснэ."
    : isSeasonalGarbage
      ? "Ажлын нэр, хариуцах хүн, эхлэх болон дуусах хугацааг оруулаад энгийн ажил үүсгэнэ."
      : isRoadAreaCleaning
        ? "Цэвэрлэх талбай, ажиллах хугацаа, хариуцах ажилтныг бүртгэж зам талбайн цэвэрлэгээний ажлыг шууд үүсгэнэ."
      : "Ажлын нэр, хариуцсан хэлтсийн дарга, хугацаагаа оруулна.";
  const selectedDepartmentLabel =
    isSharedWork
      ? sharedDepartmentIds.length
        ? `${sharedDepartmentIds.length} хэлтэс сонгосон`
        : "Хэлтсүүд сонгоно"
      : lockedDepartmentLabel ?? selectedDepartment?.label ?? selectedDepartment?.name ?? "Сонгоогүй";
  const chooseGreenWorkflow = (nextOperationUnit: "road_area_cleaning" | "standard") => {
    setOperationUnit(nextOperationUnit);
    setGreenWorkflowStep("form");
  };

  return (
    <form
      action={action}
      className={`${styles.form} ${styles.createWorkForm}`}
      data-create-flow={isRoadAreaCleaning ? "quick" : showProjectDetails ? "full" : "default"}
    >
      {showGreenWorkflowSelector ? (
        <div className={styles.mobileWorkflowTopBar}>
          <button
            type="button"
            className={styles.mobileWorkflowBackButton}
            onClick={() => {
              if (greenWorkflowStep === "form") {
                setGreenWorkflowStep("select");
                return;
              }
              window.history.back();
            }}
            aria-label="Буцах"
          >
            ←
          </button>
          <strong>{mobileScreenTitle}</strong>
        </div>
      ) : null}

      {isGreenWorkflowSelectScreen ? (
        <>
          <section className={styles.workflowSelectScreen} aria-label="Ажлын төрөл сонгох">
            <div className={styles.workflowSelectHeader}>
              <h2>Ажлын төрөл сонгох</h2>
              <p>Та ямар төрлийн ажил нэмэх вэ?</p>
            </div>

            <button
              type="button"
              className={styles.workflowSelectCard}
              onClick={() => chooseGreenWorkflow("standard")}
            >
              <span className={styles.workflowSelectVisual}>
                <Wrench aria-hidden />
              </span>
              <span className={styles.workflowSelectCopy}>
                <strong>Ногоон байгууламжийн ажил</strong>
                <small>Усалгаа, тохижилт, засвар үйлчилгээ</small>
              </span>
              <ChevronRight aria-hidden className={styles.workflowSelectChevron} />
            </button>

            <button
              type="button"
              className={styles.workflowSelectCard}
              onClick={() => chooseGreenWorkflow("road_area_cleaning")}
            >
              <span className={styles.workflowSelectVisual}>
                <Sparkles aria-hidden />
              </span>
              <span className={styles.workflowSelectCopy}>
                <strong>Зам талбайн цэвэрлэгээ</strong>
                <small>Өдөр тутмын цэвэрлэгээний ажил автоматаар үүсгэнэ</small>
              </span>
              <ChevronRight aria-hidden className={styles.workflowSelectChevron} />
            </button>

          </section>
        </>
      ) : null}

      {!isGreenWorkflowSelectScreen ? (
        <>
      <div className={styles.createWorkIntro}>
        <div className={styles.createWorkIntroCopy}>
          <span className={styles.formBadge}>Ажил нэмэх урсгал</span>
          <h2>{formModeLabel}</h2>
          <p>{formModeDescription}</p>
        </div>

        <div className={styles.createWorkSteps} aria-label="Ажил үүсгэх алхам">
          <div className={styles.createWorkStep}>
            <span><Layers3 aria-hidden /></span>
            <strong>Хэлтэс ба горим</strong>
            <small>{selectedDepartmentLabel}</small>
          </div>
        </div>

        <div className={styles.createWorkSignalGrid} aria-label="Сонгосон ажлын товч мэдээлэл">
          {isGarbageTransport ? (
            <>
              <div>
                <Truck aria-hidden />
                <span>Техник</span>
                <strong>{selectedVehicle?.plate || "Сонгоогүй"}</strong>
              </div>
              <div>
                <ListChecks aria-hidden />
                <span>Хогийн цэгүүд</span>
                <strong>
                  {garbageSubdistrictOptions.find((option) => option.id === garbageSubdistrictId)?.label ||
                    "Сонгоогүй"}
                  {selectedGarbagePoints.length ? ` · ${selectedGarbagePoints.length} цэг` : ""}
                </strong>
              </div>
            </>
          ) : null}
          {isRoadAreaCleaning ? (
            <>
              <div>
                <MapPin aria-hidden />
                <span>Талбай</span>
                <strong>
                  {roadCleaningReadyLineCount
                    ? `${roadCleaningReadyLineCount}/${roadCleaningLines.length} бэлэн`
                    : "Сонгоогүй"}
                </strong>
              </div>
              <div>
                <UserCheck aria-hidden />
                <span>Мастер</span>
                <strong>{selectedCleaningMaster?.name || "Сонгоогүй"}</strong>
              </div>
            </>
          ) : null}
          <div>
            <CalendarDays aria-hidden />
            <span>Огноо</span>
            <strong>
              {isSeasonalGarbage
                ? formatDateLabel(seasonalStartDate)
                : isRoadAreaCleaning
                  ? formatDateLabel(cleaningWorkDate)
                : formatDateLabel(shiftDate)}
            </strong>
          </div>
        </div>
      </div>

      {!isDepartmentLocked && canCreateSharedWork ? (
        <div className={styles.optionalSection}>
          <div className={styles.field}>
            <label>Ажлын төрөл</label>
            <div className={styles.modeRail}>
              <button
                type="button"
                className={`${styles.modeChip} ${!isSharedWork ? styles.modeChipActive : ""}`}
                onClick={() => {
                  setOperationUnit(() => {
                    if (supportsGarbageTransport) return "garbage_transport";
                    if (supportsRoadAreaCleaning) return "road_area_cleaning";
                    return "standard";
                  });
                }}
              >
                <span>Нэг хэлтсийн ажил</span>
                <small>Нэг хариуцах хэлтэс сонгож ердийн ажил үүсгэнэ.</small>
              </button>
              <button
                type="button"
                className={`${styles.modeChip} ${isSharedWork ? styles.modeChipActive : ""}`}
                onClick={() => setOperationUnit("shared_work")}
              >
                <span>Хамтарсан ажил</span>
                <small>Олон хэлтэс сонгоод хэлтэс бүр дээр тусдаа хариуцах ажил үүсгэнэ.</small>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isSharedWork ? (
        <div className={styles.optionalSection}>
          <span className={styles.formBadge}>Оролцох хэлтэс</span>
          <p className={styles.fieldHint}>
            Хамтрах хэлтсүүдээ сонгоно. Хадгалахад сонгосон хэлтэс бүр дээр нэг хэлтсийн ажил автоматаар үүснэ.
          </p>
          <div className={styles.sharedWorkDepartmentPicker}>
            {sharedDepartmentOptions.map((option) => {
              const optionId = String(option.id);
              const checked = sharedDepartmentIds.includes(optionId);
              return (
                <label key={option.id} className={styles.sharedWorkDepartmentCard}>
                  <input
                    type="checkbox"
                    name="shared_department_ids"
                    value={option.id}
                    checked={checked}
                    onChange={(event) => {
                      setSharedDepartmentIds((current) =>
                        event.target.checked
                          ? Array.from(new Set([...current, optionId]))
                          : current.filter((id) => id !== optionId),
                      );
                    }}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{checked ? "Оролцоно" : "Сонгох"}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : isDepartmentLocked ? (
        <input type="hidden" name="department_id" value={departmentId} />
      ) : (
        <div className={styles.field}>
          <label htmlFor="department_id">Хэлтэс</label>
          <select
            id="department_id"
            name="department_id"
            value={departmentId}
            onChange={(event) => handleDepartmentChange(event.target.value)}
            required
          >
            <option value="">Хэлтэс сонгоно уу</option>
            {departmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {supportsGarbageTransport && !isSharedWork ? (
        <div className={styles.optionalSection}>
          <div className={styles.field}>
            <label>Ажлын горим</label>
            <div className={styles.operationModeGrid}>
              {isCombinedDepartment ? (
                <div
                  className={`${styles.operationModeGroup} ${
                    operationUnit === "auto_base" ? styles.modeChipActive : ""
                  }`}
                >
                  <button
                    type="button"
                    className={styles.operationModeButton}
                    onClick={() => setOperationUnit("auto_base")}
                  >
                    <span>Авто баазын ажил</span>
                    <small>Техник, засвар, бэлэн байдал</small>
                  </button>
                </div>
              ) : null}

              <div
                className={`${styles.operationModeGroup} ${
                  operationUnit === "garbage_transport" || operationUnit === "garbage_seasonal"
                    ? styles.operationModeGroupActive
                    : ""
                }`}
              >
                <div className={styles.operationModeGroupHeader}>
                  <span>Хог тээвэрлэлтийн ажил</span>
                  <small>Маршрут, хогийн цэг болон гэнэтийн дуудлагын ажил</small>
                </div>
                <div className={styles.operationSubModeRail}>
                  <button
                    type="button"
                    className={`${styles.modeChip} ${
                      operationUnit === "garbage_transport" ? styles.modeChipActive : ""
                    }`}
                    onClick={() => setOperationUnit("garbage_transport")}
                  >
                    <span>Хогийн цэгийн ажил</span>
                    <small>Машин, хороо, олон хогийн цэгийн өдөр тутмын ажил</small>
                  </button>

                  <button
                    type="button"
                    className={`${styles.modeChip} ${
                      operationUnit === "garbage_seasonal" ? styles.modeChipActive : ""
                    }`}
                    onClick={() => setOperationUnit("garbage_seasonal")}
                  >
                    <span>Гэнэтийн ажил</span>
                    <small>Энгийн ажил шиг нэр, хугацаа, хариуцах хүнтэй үүсгэнэ</small>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showRoadCleaningModePicker ? (
        <div className={`${styles.optionalSection} ${styles.workflowModePicker}`}>
          <div className={styles.field}>
            <label>Ажлын горим</label>
            <div className={styles.modeRail}>
              <button
                type="button"
                className={`${styles.modeChip} ${
                  operationUnit === "road_area_cleaning" ? styles.modeChipActive : ""
                }`}
                onClick={() => setOperationUnit("road_area_cleaning")}
              >
                <Sparkles aria-hidden />
                <span>Зам талбайн цэвэрлэгээ</span>
                <small>Цэвэрлэх талбай, хугацаа, хариуцах ажилтантай ажил</small>
              </button>

              <button
                type="button"
                className={`${styles.modeChip} ${
                  operationUnit === "standard" ? styles.modeChipActive : ""
                }`}
                onClick={() => setOperationUnit("standard")}
              >
                <span>Ерөнхий ажил</span>
                <small>Ногоон байгууламжийн бусад ажил</small>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input type="hidden" name="operation_unit" value={operationUnit} />

      {isGarbageTransport ? (
        <>
          {initialGarbageVehicleId ? (
            <div className={styles.optionalSection}>
              <span className={styles.formBadge}>Машинаас даалгавар үүсгэж байна</span>
              <p className={styles.helperNote}>
                Сонгосон машин, огноо, хороо болон хогийн цэгүүд нь даалгаварт хадгалагдана.
                Ингэснээр өдөр тутмын болон 7 хоногийн тайлан машин, огноогоор зөв шүүгдэнэ.
              </p>
            </div>
          ) : null}

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="garbage_vehicle_id">Машины дугаар</label>
              <select
                id="garbage_vehicle_id"
                name="garbage_vehicle_id"
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                required={isGarbageTransport}
              >
                <option value="">Машин сонгоно уу</option>
                {garbageVehicleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="garbage_subdistrict_id">Хороо</label>
              <select
                id="garbage_subdistrict_id"
                name="garbage_subdistrict_id"
                value={garbageSubdistrictId}
                onChange={(event) => handleGarbageSubdistrictChange(event.target.value)}
                required={isGarbageTransport}
              >
                <option value="">Өөрт оноогдсон хороо сонгох</option>
                {garbageSubdistrictOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="start_date">Огноо</label>
              <input
                id="start_date"
                name="start_date"
                type="date"
                value={shiftDate}
                onChange={(event) => setShiftDate(event.target.value)}
                required={isGarbageTransport}
              />
            </div>
          </div>

          <div className={styles.optionalSection}>
            <div className={styles.pointPickerHeader}>
              <div>
                <span className={styles.formBadge}>Хогийн цэг сонгох</span>
                <p className={styles.fieldHint}>Нэг даалгаварт олон хогийн цэг сонгож болно.</p>
              </div>
              <strong>{selectedGarbagePoints.length ? `Сонгосон: ${selectedGarbagePoints.length} цэг` : "Цэг сонгоогүй"}</strong>
            </div>
            {garbageSubdistrictId ? (
              filteredGarbagePointOptions.length ? (
                <>
                  {selectedGarbagePoints.length ? (
                    <div className={styles.pointSelectedSummary}>
                      {selectedGarbagePoints.slice(0, 4).map((point) => (
                        <span key={`selected-${point.id}`}>{point.name}</span>
                      ))}
                      {selectedGarbagePoints.length > 4 ? (
                        <span>+{selectedGarbagePoints.length - 4} цэг</span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={styles.pointCheckboxGrid}>
                    {filteredGarbagePointOptions.map((point) => {
                      const checked = selectedGarbagePointIds.includes(String(point.id));

                      return (
                        <label
                          key={point.id}
                          className={`${styles.pointCheckbox} ${checked ? styles.pointCheckboxActive : ""}`}
                        >
                          <input
                            type="checkbox"
                            name="garbage_point_ids"
                            value={point.id}
                            checked={checked}
                            onChange={() => toggleGarbagePoint(point.id)}
                          />
                          <span>{point.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className={styles.helperNote}>Энэ хороонд танд оноогдсон хогийн цэг алга.</p>
              )
            ) : (
              <p className={styles.helperNote}>Эхлээд өөрт оноогдсон хороогоо сонгоно уу.</p>
            )}
          </div>

          <input type="hidden" name="name" value={generatedName} />
          <input type="hidden" name="garbage_loader_override" value="1" />
          {selectedLoaderIds.map((loaderId) => (
            <input key={loaderId} type="hidden" name="garbage_loader_employee_ids" value={loaderId} />
          ))}

          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <span className={styles.eyebrow}>Хог тээвэрлэлтийн ажил</span>
              <strong>
                {generatedName ||
                  "Машин, байршил сонгоход нэр автоматаар үүснэ"}
              </strong>
            </div>

            <div className={styles.previewGrid}>
              <div className={styles.previewMeta}>
                <span>Сонгосон машин</span>
                <strong>{selectedVehicle?.plate || "Сонгоогүй"}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Жолооч</span>
                <strong>{selectedVehicle?.driverName || "Оноогоогүй"}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Ачигч</span>
                {selectedLoaderIds.length ? (
                  <div className={styles.editableChipRow}>
                    {selectedLoaderIds.map((loaderId, index) => (
                      <span key={loaderId} className={styles.editableChip}>
                        <strong>{selectedLoaderLabels[index]}</strong>
                        <button
                          type="button"
                          onClick={() => removeLoader(loaderId)}
                          aria-label={`${selectedLoaderLabels[index]} хасах`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <strong>Оноогоогүй</strong>
                )}
                <select
                  aria-label="Ачигч нэмэх"
                  value=""
                  onChange={(event) => {
                    addLoader(event.target.value);
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="">Ачигч нэмэх</option>
                  {loaderEmployeeOptions
                    .filter((employee) => !selectedLoaderIds.includes(String(employee.id)))
                    .map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className={styles.previewMeta}>
                <span>Хороо</span>
                <strong>
                  {garbageSubdistrictOptions.find((option) => option.id === garbageSubdistrictId)?.label ||
                    "Сонгоогүй"}
                </strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Цэгийн тоо</span>
                <strong>{selectedGarbagePoints.length ? `${selectedGarbagePoints.length} цэг` : "—"}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Ажил оруулсан</span>
                <strong>Хяналтын байцаагч</strong>
              </div>
            </div>

            <p className={styles.helperNote}>
              Сонгосон машин, хороо, хогийн цэгүүдээр тухайн өдрийн ажил үүснэ. Хогийн цэг бүр
              ажил дотор тусдаа цэг болж нэмэгдэнэ.
            </p>
            <p className={styles.helperNote}>
              Огноо: <strong>{formatDateLabel(shiftDate)}</strong>
            </p>
          </div>
        </>
      ) : isAutoBase ? (
        <>
          <input type="hidden" name="name" value={autoBaseRequestTitle} />
          <input
            type="hidden"
            name="auto_base_vehicle_label"
            value={selectedAutoBaseVehicle?.plate || selectedAutoBaseVehicle?.label || ""}
          />

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="auto_base_vehicle_id">Машин</label>
              <select
                id="auto_base_vehicle_id"
                name="auto_base_vehicle_id"
                value={autoBaseVehicleId}
                onChange={(event) => setAutoBaseVehicleId(event.target.value)}
                required={isAutoBase}
              >
                <option value="">Машин сонгох</option>
                {garbageVehicleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="auto_base_required_date">Шаардлагатай огноо</label>
              <input id="auto_base_required_date" name="auto_base_required_date" type="date" />
            </div>
          </div>

          <div className={styles.optionalSection}>
            <span className={styles.formBadge}>Худалдан авалтын хүсэлт</span>
            <div className={styles.field}>
              <label htmlFor="auto_base_item_name">Авах зүйлийн нэр</label>
              <input
                id="auto_base_item_name"
                name="auto_base_item_name"
                value={autoBaseItemName}
                onChange={(event) => setAutoBaseItemName(event.target.value)}
                placeholder="Жишээ: Дугуй, аккумлятор, сэлбэг"
                required={isAutoBase}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="auto_base_item_description">Тайлбар</label>
              <textarea
                id="auto_base_item_description"
                name="auto_base_item_description"
                placeholder="Марк, хэмжээ, техникийн шаардлага, яагаад авах шаардлагатайг бичнэ үү"
              />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="auto_base_item_quantity">Авах тоо</label>
                <input
                  id="auto_base_item_quantity"
                  name="auto_base_item_quantity"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={autoBaseQuantity}
                  onChange={(event) => setAutoBaseQuantity(event.target.value)}
                  required={isAutoBase}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="auto_base_item_unit_price">Нэгж үнэ</label>
                <input
                  id="auto_base_item_unit_price"
                  name="auto_base_item_unit_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={autoBaseUnitPrice}
                  onChange={(event) => setAutoBaseUnitPrice(event.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="auto_base_item_images">Зураг</label>
              <label className={styles.fileDropZone} htmlFor="auto_base_item_images">
                <Paperclip aria-hidden />
                <span>Зураг байвал хавсаргана. Заавал биш.</span>
              </label>
              <input
                id="auto_base_item_images"
                name="auto_base_item_images"
                type="file"
                multiple
                accept="image/*"
                className={styles.hiddenFileInput}
                onChange={(event) => {
                  const nextPreviews = Array.from(event.target.files ?? []).map((file) => ({
                    name: file.name,
                    type: file.type,
                    url: URL.createObjectURL(file),
                  }));
                  autoBaseImagePreviews.forEach((file) => URL.revokeObjectURL(file.url));
                  setAutoBaseImagePreviews(nextPreviews);
                }}
              />
              {autoBaseImagePreviews.length ? (
                <div className={styles.attachmentPreviewGrid}>
                  {autoBaseImagePreviews.map((file) => (
                    <div className={styles.attachmentPreviewItem} key={`${file.name}-${file.url}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file.url} alt={file.name} />
                      <span>{file.name}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <input
              type="hidden"
              name="auto_base_extra_lines_json"
              value={JSON.stringify(
                autoBaseLines.map((line, index) => ({
                  sequence: index + 2,
                  itemName: line.itemName,
                  description: line.description,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  imageFieldName: `auto_base_extra_item_images_${line.id}`,
                })),
              )}
            />

            {autoBaseLines.map((line, index) => (
              <section key={line.id} className={styles.optionalSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.sectionKicker}>Мөр {index + 2}</span>
                    <small className={styles.sectionNote}>
                      Нэмэлт сэлбэг, материалын нэр, тоо, үнийг тусад нь оруулна.
                    </small>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => removeAutoBaseLine(line.id)}
                  >
                    Мөр хасах
                  </button>
                </div>

                <div className={styles.field}>
                  <label htmlFor={`auto_base_extra_item_name_${line.id}`}>Авах зүйлийн нэр</label>
                  <input
                    id={`auto_base_extra_item_name_${line.id}`}
                    value={line.itemName}
                    onChange={(event) =>
                      updateAutoBaseLine(line.id, "itemName", event.target.value)
                    }
                    placeholder="Жишээ: Тос, фильтр, ремень"
                    required={isAutoBase}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor={`auto_base_extra_item_description_${line.id}`}>Тайлбар</label>
                  <textarea
                    id={`auto_base_extra_item_description_${line.id}`}
                    value={line.description}
                    onChange={(event) =>
                      updateAutoBaseLine(line.id, "description", event.target.value)
                    }
                    placeholder="Марк, хэмжээ, техникийн шаардлага"
                  />
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label htmlFor={`auto_base_extra_item_quantity_${line.id}`}>Авах тоо</label>
                    <input
                      id={`auto_base_extra_item_quantity_${line.id}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.quantity}
                      onChange={(event) =>
                        updateAutoBaseLine(line.id, "quantity", event.target.value)
                      }
                      required={isAutoBase}
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor={`auto_base_extra_item_unit_price_${line.id}`}>Нэгж үнэ</label>
                    <input
                      id={`auto_base_extra_item_unit_price_${line.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateAutoBaseLine(line.id, "unitPrice", event.target.value)
                      }
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor={`auto_base_extra_item_images_${line.id}`}>Зураг</label>
                  <label
                    className={styles.fileDropZone}
                    htmlFor={`auto_base_extra_item_images_${line.id}`}
                  >
                    <Paperclip aria-hidden />
                    <span>Зураг байвал хавсаргана. Заавал биш.</span>
                  </label>
                  <input
                    id={`auto_base_extra_item_images_${line.id}`}
                    name={`auto_base_extra_item_images_${line.id}`}
                    type="file"
                    multiple
                    accept="image/*"
                    className={styles.hiddenFileInput}
                    onChange={(event) => updateAutoBaseLineImages(line.id, event.target.files)}
                  />
                  {line.imagePreviews.length ? (
                    <div className={styles.attachmentPreviewGrid}>
                      {line.imagePreviews.map((file) => (
                        <div className={styles.attachmentPreviewItem} key={`${file.name}-${file.url}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={file.url} alt={file.name} />
                          <span>{file.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            ))}

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  setAutoBaseLines((current) => [...current, emptyAutoBaseLine(current.length)])
                }
              >
                Мөр нэмэх
              </button>
            </div>
          </div>

          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <span className={styles.eyebrow}>Шууд худалдан авалтын хүсэлт</span>
              <strong>{autoBaseRequestTitle}</strong>
            </div>
            <div className={styles.previewGrid}>
              <div className={styles.previewMeta}>
                <span>Машин</span>
                <strong>{selectedAutoBaseVehicle?.plate || selectedAutoBaseVehicle?.label || "Сонгоогүй"}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Авах зүйл</span>
                <strong>
                  {[autoBaseItemName, ...autoBaseLines.map((line) => line.itemName)]
                    .map((itemName) => itemName.trim())
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(", ") || "Оруулаагүй"}
                </strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Мөрийн тоо</span>
                <strong>{1 + activeAutoBaseLines.length}</strong>
              </div>
              <div className={styles.previewMeta}>
                <span>Нийт дүн</span>
                <strong>{autoBaseTotalPrice ? autoBaseTotalPrice.toLocaleString("mn-MN") : "0"} ₮</strong>
              </div>
            </div>
            <p className={styles.helperNote}>
              Илгээхэд энэ мэдээллээр худалдан авалтын хүсэлт шууд үүсэж, зураг хавсаргасан бол мөрийн зурагт хадгалагдана.
            </p>
          </div>
        </>
      ) : isSeasonalGarbage ? (
        <>
          <input type="hidden" name="operation_type" value="garbage_seasonal" />

          <section className={`${styles.optionalSection} ${styles.fullTaskSection}`}>
            <div className={styles.fullTaskSectionTitle}>
              <span>1</span>
              <strong>Үндсэн мэдээлэл</strong>
            </div>
            <div className={styles.field}>
              <label htmlFor="seasonal-name">Ажлын нэр</label>
              <input
                id="seasonal-name"
                name="name"
                type="text"
                placeholder="Жишээ: Барилгын хог ачилт"
                required={isSeasonalGarbage}
              />
            </div>

            <div className={styles.field}>
              <label>Хариуцах хүн</label>
              <div className={styles.lockedFieldValue}>
                {selectedDepartmentHead
                  ? [
                      selectedDepartmentHead.name,
                      selectedDepartmentHead.jobTitle,
                      selectedDepartmentHead.login,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : selectedDepartment
                    ? "Хариуцах хүн олдсонгүй"
                    : "Эхлээд хэлтэс сонгоно уу"}
              </div>
              <input
                type="hidden"
                name="manager_id"
                value={selectedDepartmentHead ? String(selectedDepartmentHead.id) : ""}
              />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="seasonal-start-date">Эхлэх огноо</label>
                <input
                  id="seasonal-start-date"
                  name="start_date"
                  type="date"
                  value={seasonalStartDate}
                  onChange={(event) => setSeasonalStartDate(event.target.value)}
                  required={isSeasonalGarbage}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="seasonal-deadline">Дуусах огноо</label>
                <input
                  id="seasonal-deadline"
                  name="deadline"
                  type="date"
                  required={isSeasonalGarbage}
                />
              </div>
            </div>
          </section>

          <div className={styles.optionalSection}>
            <span className={styles.formBadge}>Нэмэлт мэдээлэл</span>
            <div className={styles.field}>
              <label htmlFor="project_description">Ажлын тайлбар</label>
              <textarea
                id="project_description"
                name="project_description"
                placeholder="Ажлын зорилго, хамрах хүрээ, анхаарах зүйлсийг бичнэ үү."
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="project_files">Файл хавсаргах</label>
              <label className={styles.fileDropZone} htmlFor="project_files">
                <Paperclip aria-hidden />
                <span>Зураг, баримт зэрэг файл хавсаргаж болно.</span>
              </label>
              <input
                id="project_files"
                name="project_files"
                type="file"
                multiple
                className={styles.hiddenFileInput}
                onChange={(event) => {
                  const nextPreviews = Array.from(event.target.files ?? []).map((file) => ({
                    name: file.name,
                    type: file.type,
                    url: URL.createObjectURL(file),
                  }));
                  projectFilePreviews.forEach((file) => URL.revokeObjectURL(file.url));
                  setProjectFilePreviews(nextPreviews);
                }}
              />
              {projectFilePreviews.length ? (
                <div className={styles.attachmentPreviewGrid}>
                  {projectFilePreviews.map((file) => (
                    <div className={styles.attachmentPreviewItem} key={`${file.name}-${file.url}`}>
                      <FileText aria-hidden />
                      <span>{file.name}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </>      ) : isRoadAreaCleaning ? (
        <>
          <div className={styles.roadCleaningQuickPanel}>
            <div className={styles.roadCleaningQuickHeader}>
              <span className={styles.formBadge}>Зам талбайн цэвэрлэгээ</span>
              <h3>Зам талбайн цэвэрлэгээний ажил нэмэх</h3>
              <p>Нэг мөр нь нэг ажил болно. Ажил бүр дээр 4 стандарт даалгавар автоматаар үүснэ.</p>
            </div>
            <div className={styles.roadCleaningStepper} aria-label="Ажил үүсгэх алхам">
              {["Хэлтэс", "Огноо", "Талбай ба ажилтан", "Хянах & илгээх"].map((step, index) => (
                <span key={step} className={index < 3 ? styles.roadCleaningStepDone : ""}>
                  <b>{index + 1}</b>
                  {step}
                </span>
              ))}
            </div>
            <div className={styles.roadCleaningProgress}>
              <div>
                <CalendarDays aria-hidden />
                <span>{formatDateLabel(cleaningWorkDate)}</span>
              </div>
              <div className={effectiveCleaningMasterId ? styles.roadCleaningProgressDone : ""}>
                <UserCheck aria-hidden />
                <span>{selectedCleaningMaster?.name || "Мастер сонгоно"}</span>
              </div>
              <div
                className={
                  roadCleaningReadyLineCount === roadCleaningLines.length
                    ? styles.roadCleaningProgressDone
                    : ""
                }
              >
                <CheckCircle2 aria-hidden />
                <span>
                  {roadCleaningReadyLineCount}/{roadCleaningLines.length} мөр бэлэн
                </span>
              </div>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="work_date">Ажлын огноо</label>
              <input
                id="work_date"
                name="work_date"
                type="date"
                value={cleaningWorkDate}
                onChange={(event) => setCleaningWorkDate(event.target.value)}
                required={isRoadAreaCleaning}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={currentRoadCleaningMaster ? undefined : "cleaning_master_id"}>
                Хариуцсан мастер
              </label>
              {currentRoadCleaningMaster ? (
                <div className={styles.lockedFieldValue}>
                  {[
                    currentRoadCleaningMaster.name,
                    roadCleaningMasterRoleLabel(currentRoadCleaningMaster),
                    currentRoadCleaningMaster.departmentName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : (
                <select
                  id="cleaning_master_id"
                  value={cleaningMasterId}
                  onChange={(event) => setCleaningMasterId(event.target.value)}
                  required={isRoadAreaCleaning}
                >
                  <option value="">Мастер сонгоно уу</option>
                  {roadCleaningMasterChoices.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {[employee.name, roadCleaningMasterRoleLabel(employee), employee.departmentName]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className={styles.optionalSection}>
            <span className={styles.formBadge}>Ажилтан ба цэвэрлэх талбай</span>
            <p className={styles.fieldHint}>Нэг өдөр олон талбай дээр ажил үүсгэх бол доороос мөр нэмнэ.</p>
            <div className={styles.roadCleaningSummaryGrid}>
              <article className={styles.roadCleaningSummaryCard}>
                <span>Нийт мөр</span>
                <strong>{roadCleaningLines.length}</strong>
                <small>{roadCleaningReadyLineCount} мөр бэлэн</small>
              </article>
              <article className={styles.roadCleaningSummaryCard}>
                <span>Нийт талбай м²</span>
                <strong>{Math.round(roadCleaningTotalAreaM2).toLocaleString("mn-MN")}</strong>
                <small>Сонгосон талбайн нийлбэр</small>
              </article>
              <article className={styles.roadCleaningSummaryCard}>
                <span>Үүсэх ажил</span>
                <strong>{roadCleaningReadyLineCount}</strong>
                <small>Мөр бүр = нэг ажил</small>
              </article>
              <article className={styles.roadCleaningSummaryCard}>
                <span>Мэдэгдэл очих</span>
                <strong>{roadCleaningNotificationPeople.length}</strong>
                <small>{roadCleaningNotificationPeople.join(", ") || "Тодорхойгүй"}</small>
              </article>
            </div>
            <div className={styles.roadCleaningTableHeader}>
              <span>Цэвэрлэх талбай</span>
              <span>Хариуцсан ажилтан</span>
              <span>Талбайн хэмжээ м²</span>
              <span>Үйлдэл</span>
            </div>

            {roadCleaningLines.map((line, index) => {
              const lineArea = getRoadCleaningArea(line);
              const employeeChoices = getRoadCleaningEmployeeChoices(line);
              const generatedLineName = getRoadCleaningWorkName(line);
              const isLineReady = Boolean((line.cleaningAreaId || line.newAreaName.trim()) && line.employeeId);

              return (
                <div className={styles.roadCleaningLineCard} key={line.id}>
                  <div className={styles.roadCleaningLineHeader}>
                    <span className={styles.roadCleaningLineNumber}>{index + 1}</span>
                    <div>
                      <strong>{lineArea?.name || line.newAreaName.trim() || "Цэвэрлэх талбай"}</strong>
                      <small>{generatedLineName || "Талбай болон ажилтан сонгоно"}</small>
                    </div>
                    <em className={isLineReady ? styles.roadCleaningLineReady : ""}>
                      {isLineReady ? "Бэлэн" : "Дутуу"}
                    </em>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor={`cleaning_area_${line.id}`}>Цэвэрлэх талбай</label>
                      <select
                        id={`cleaning_area_${line.id}`}
                        value={line.cleaningAreaId}
                        onChange={(event) =>
                          updateRoadCleaningLine(line.id, "cleaningAreaId", event.target.value)
                        }
                        disabled={line.showNewArea}
                      >
                        <option value="">Цэвэрлэх талбай сонгоно уу</option>
                        {visibleRoadCleaningAreaChoices.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor={`cleaning_employee_${line.id}`}>Хариуцсан ажилтан</label>
                      <select
                        id={`cleaning_employee_${line.id}`}
                        value={line.employeeId}
                        onChange={(event) =>
                          updateRoadCleaningLine(line.id, "employeeId", event.target.value)
                        }
                      >
                        <option value="">Ажилтан сонгоно уу</option>
                        {employeeChoices.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {[employee.name, employee.jobTitle, employee.departmentName]
                              .filter(Boolean)
                              .join(" · ")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label>Талбайн хэмжээ м²</label>
                      <div className={styles.lockedFieldValue}>
                        {getRoadCleaningLineAreaM2(line)
                          ? Math.round(getRoadCleaningLineAreaM2(line)).toLocaleString("mn-MN")
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className={styles.buttonRow}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() =>
                        updateRoadCleaningLine(line.id, "showNewArea", !line.showNewArea)
                      }
                    >
                      {line.showNewArea ? "Бэлэн талбай сонгох" : "Талбай нэмэх"}
                    </button>
                    {roadCleaningLines.length > 1 ? (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => removeRoadCleaningLine(line.id)}
                        aria-label={`Мөр ${index + 1} устгах`}
                      >
                        <Trash2 aria-hidden />
                        <span>Мөр устгах</span>
                      </button>
                    ) : null}
                  </div>

                  {line.showNewArea ? (
                    <>
                      <div className={styles.field}>
                        <label htmlFor={`new_cleaning_area_${line.id}`}>Шинэ цэвэрлэх талбай</label>
                        <input
                          id={`new_cleaning_area_${line.id}`}
                          type="text"
                          value={line.newAreaName}
                          onChange={(event) =>
                            updateRoadCleaningLine(line.id, "newAreaName", event.target.value)
                          }
                          placeholder="Жишээ: Наадамчдын зам — 1-р хэсэг"
                        />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor={`new_cleaning_area_m2_${line.id}`}>Талбайн хэмжээ м²</label>
                        <input
                          id={`new_cleaning_area_m2_${line.id}`}
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={line.newAreaM2}
                          onChange={(event) =>
                            updateRoadCleaningLine(line.id, "newAreaM2", event.target.value)
                          }
                          placeholder="1250"
                        />
                      </div>
                      <div className={styles.buttonRow}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => createRoadCleaningAreaFromLine(line.id)}
                          disabled={savingRoadCleaningAreaId === line.id}
                        >
                          {savingRoadCleaningAreaId === line.id
                            ? "Хадгалж байна..."
                            : "Талбай хадгалах"}
                        </button>
                      </div>
                      {roadCleaningAreaError ? (
                        <p className={`${styles.message} ${styles.errorMessage}`}>
                          {roadCleaningAreaError}
                        </p>
                      ) : null}
                    </>
                  ) : null}

                  {lineArea ? (
                    <div className={styles.roadCleaningAreaDetails}>
                      <div className={styles.lockedFieldValue}>
                        <strong>Гудамж / замын нэр</strong>
                        <span>{lineArea.streetName || "—"}</span>
                      </div>
                      <div className={styles.lockedFieldValue}>
                        <strong>Эхлэх цэг</strong>
                        <span>{lineArea.startPoint || "—"}</span>
                      </div>
                      <div className={styles.lockedFieldValue}>
                        <strong>Дуусах цэг</strong>
                        <span>{lineArea.endPoint || "—"}</span>
                      </div>
                      <div className={styles.lockedFieldValue}>
                        <strong>Талбай /мкв/</strong>
                        <span>{lineArea.areaM2 || "—"}</span>
                      </div>
                      <div className={styles.lockedFieldValue}>
                        <strong>Давтамж</strong>
                        <span>{lineArea.frequencyLabel || "—"}</span>
                      </div>
                      <div className={styles.lockedFieldValue}>
                        <strong>Хариуцсан мастер</strong>
                        <span>{lineArea.masterName || selectedDepartmentHead?.name || "—"}</span>
                      </div>
                    </div>
                  ) : null}

                </div>
              );
            })}

            <input
              type="hidden"
              name="road_cleaning_lines_json"
              value={JSON.stringify(
                roadCleaningLines.map((line, index) => ({
                  sequence: index + 1,
                  cleaningAreaId: line.cleaningAreaId ? Number(line.cleaningAreaId) : null,
                  employeeId: line.employeeId ? Number(line.employeeId) : null,
                  masterId: effectiveCleaningMasterId
                    ? Number(effectiveCleaningMasterId)
                    : (getRoadCleaningArea(line)?.masterId ?? null),
                  areaName: getRoadCleaningArea(line)?.name || line.newAreaName.trim(),
                  newAreaName: line.newAreaName.trim(),
                })),
              )}
            />
            <input type="hidden" name="name" value="Зам талбайн цэвэрлэгээ" />

            <div className={styles.roadCleaningPreviewPanel}>
              <div>
                <span className={styles.formBadge}>Хянах & илгээх</span>
                <strong>Илгээхэд үүсэх бүтэц</strong>
                <p>Бэлэн мөр бүр нэг ажил болж, ажил бүр дээр дараах 4 даалгавар автоматаар үүснэ.</p>
              </div>
              <div className={styles.roadCleaningAutoTaskList}>
                {roadCleaningAutoTasks.map((taskName, taskIndex) => (
                  <span key={taskName}>
                    <b>{taskIndex + 1}</b>
                    {taskName}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  setRoadCleaningLines((current) => [
                    ...current,
                    emptyRoadCleaningLine(current.length),
                  ])
                }
              >
                + Мөр нэмэх
              </button>
            </div>
          </div>

        </>
      ) : (
        <>
          <section className={`${styles.optionalSection} ${styles.fullTaskSection}`}>
            <div className={styles.fullTaskSectionTitle}>
              <span>1</span>
              <strong>Үндсэн мэдээлэл</strong>
            </div>
            <div className={styles.field}>
              <label htmlFor="name">Ажлын нэр</label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder={
                  isRoadAreaCleaning
                    ? "Жишээ: Наадамчдын замын цэвэрлэгээ"
                    : "Жишээ: Хаврын тохижилтын ажил"
                }
                required
              />
            </div>
            <input type="hidden" name="operation_type" value={CUSTOM_WORK_TYPE_VALUE} />

            {!isSharedWork ? (
              <div className={styles.field}>
                <label>Хариуцах ажилтан</label>
                <div className={styles.lockedFieldValue}>
                  {selectedDepartmentHead
                    ? [
                        selectedDepartmentHead.name,
                        selectedDepartmentHead.jobTitle,
                        selectedDepartmentHead.login,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : selectedDepartment
                      ? "Хэлтсийн дарга олдсонгүй"
                      : "Эхлээд хэлтэс сонгоно уу"}
                </div>
                <input
                  type="hidden"
                  name="manager_id"
                  value={selectedDepartmentHead ? String(selectedDepartmentHead.id) : ""}
                />
              </div>
            ) : null}

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="start_date">Эхлэх огноо</label>
                <input id="start_date" name="start_date" type="date" />
              </div>

              <div className={styles.field}>
                <label htmlFor="deadline">Дуусах огноо</label>
                <input id="deadline" name="deadline" type="date" />
              </div>
            </div>
          </section>
        </>
      )}

      {showProjectDetails ? (
        <div className={styles.optionalSection}>
          <span className={styles.formBadge}>Нэмэлт мэдээлэл</span>
          <div className={styles.field}>
            <label htmlFor="project_description">Ажлын тайлбар</label>
            <textarea
              id="project_description"
              name="project_description"
              placeholder="Ажлын зорилго, хамрах хүрээ, анхаарах зүйлсийг бичнэ үү."
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="project_files">Файл хавсаргах</label>
            <label className={styles.fileDropZone} htmlFor="project_files">
              <Paperclip aria-hidden />
              <span>Зураг, баримт, төлөвлөгөө зэрэг файл хавсаргаж болно.</span>
            </label>
            <input
              id="project_files"
              name="project_files"
              type="file"
              multiple
              className={styles.hiddenFileInput}
              onChange={(event) => {
                const nextPreviews = Array.from(event.target.files ?? []).map((file) => ({
                  name: file.name,
                  type: file.type,
                  url: URL.createObjectURL(file),
                }));
                projectFilePreviews.forEach((file) => URL.revokeObjectURL(file.url));
                setProjectFilePreviews(nextPreviews);
              }}
            />
            {projectFilePreviews.length ? (
              <div className={styles.attachmentPreviewGrid}>
                {projectFilePreviews.map((file) => (
                  <div className={styles.attachmentPreviewItem} key={`${file.name}-${file.url}`}>
                    <FileText aria-hidden />
                    <span>{file.name}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={styles.buttonRow}>
        <SubmitWorkButton label={submitLabel} />
      </div>
        </>
      ) : null}
    </form>
  );
}
