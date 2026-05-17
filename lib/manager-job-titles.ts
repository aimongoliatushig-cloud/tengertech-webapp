const MANAGER_JOB_TITLE_OVERRIDES = [
  {
    nameKey: "цэрдэнэбат",
    title: "Авто бааз, хог тээвэрлэлтийн хэлтсийн дарга",
  },
  {
    nameKey: "ббатцэцэг",
    title: "Тээвэрлэлтийн хяналын байцаагч",
  },
] as const;

function normalizeManagerName(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("mn-MN")
    .replace(/[^а-яө үёa-z0-9]/gi, "")
    .replace(/\s+/g, "");
}

export function resolveManagerJobTitle(
  managerName?: string | null,
  currentJobTitle?: string | null,
) {
  const normalizedName = normalizeManagerName(managerName);
  const override = MANAGER_JOB_TITLE_OVERRIDES.find((item) =>
    normalizedName.includes(item.nameKey),
  );

  return override?.title ?? (currentJobTitle ?? "").trim();
}

export function formatManagerDisplayName(
  managerName?: string | null,
  currentJobTitle?: string | null,
) {
  const name = (managerName ?? "").trim();
  const jobTitle = resolveManagerJobTitle(name, currentJobTitle);

  if (!name) {
    return jobTitle || "Бүртгэлгүй";
  }

  return jobTitle ? `${jobTitle}: ${name}` : name;
}
