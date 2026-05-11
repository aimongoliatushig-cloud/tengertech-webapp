export const FLEET_VEHICLE_ATTACHMENT_KINDS = {
  photo_front: {
    field: "municipal_photo_front_attachment_ids",
    label: "Урд талаас авсан зураг",
    inputName: "photo_front_files",
    namePrefix: "__fleet_vehicle_photo_front__",
  },
  photo_left: {
    field: "municipal_photo_left_attachment_ids",
    label: "Зүүн талаас авсан зураг",
    inputName: "photo_left_files",
    namePrefix: "__fleet_vehicle_photo_left__",
  },
  photo_right: {
    field: "municipal_photo_right_attachment_ids",
    label: "Баруун талаас авсан зураг",
    inputName: "photo_right_files",
    namePrefix: "__fleet_vehicle_photo_right__",
  },
  certificate: {
    field: "municipal_certificate_attachment_ids",
    label: "Гэрчилгээний баримт",
    inputName: "certificate_files",
    namePrefix: "__fleet_vehicle_certificate__",
  },
  other_document: {
    field: "municipal_other_document_attachment_ids",
    label: "Бусад бичиг баримт",
    inputName: "other_document_files",
    namePrefix: "__fleet_vehicle_other_document__",
  },
} as const;

export type FleetVehicleAttachmentKind = keyof typeof FLEET_VEHICLE_ATTACHMENT_KINDS;
export type FleetVehicleAttachmentConfig =
  (typeof FLEET_VEHICLE_ATTACHMENT_KINDS)[FleetVehicleAttachmentKind];

export function buildFleetVehicleAttachmentName(
  config: FleetVehicleAttachmentConfig,
  fileName?: string,
) {
  const safeName = (fileName || "vehicle-attachment").trim() || "vehicle-attachment";
  return `${config.namePrefix}${safeName}`;
}

export function parseFleetVehicleAttachmentName(name?: string | false) {
  const rawName = name || "";
  for (const config of Object.values(FLEET_VEHICLE_ATTACHMENT_KINDS)) {
    if (rawName.startsWith(config.namePrefix)) {
      const displayName = rawName.slice(config.namePrefix.length).trim();
      return {
        field: config.field,
        displayName: displayName || config.label,
      };
    }
  }

  return {
    field: "",
    displayName: rawName,
  };
}
