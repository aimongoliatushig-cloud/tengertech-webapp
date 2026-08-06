import { filterByDepartment } from "@/lib/dashboard-scope";
import { normalizeDepartmentText } from "@/lib/department-permissions";
import { normalizeOrganizationUnitName } from "@/lib/department-groups";
import type { FleetVehicleBoard } from "@/lib/odoo";

export function isGreenOrImprovementVehicleScope(departmentName?: string | null) {
  const normalized = normalizeDepartmentText(
    `${departmentName ?? ""} ${normalizeOrganizationUnitName(departmentName)}`,
  );

  return normalized.includes("ногоон") || normalized.includes("тохижилт");
}

export function canUseDepartmentVehicleScope(
  requestedDepartmentName?: string | null,
  sessionDepartmentName?: string | null,
) {
  const requestedDepartment = requestedDepartmentName?.trim();
  if (!requestedDepartment || !isGreenOrImprovementVehicleScope(requestedDepartment)) {
    return false;
  }

  if (!sessionDepartmentName) {
    return true;
  }

  return (
    filterByDepartment([{ departmentName: requestedDepartment }], sessionDepartmentName).length > 0 ||
    filterByDepartment([{ departmentName: sessionDepartmentName }], requestedDepartment).length > 0
  );
}

export function scopeFleetVehicleBoardByDepartment(
  board: FleetVehicleBoard,
  scopedDepartmentName?: string | null,
): FleetVehicleBoard {
  const allVehicles = board.allVehicles.filter(
    (vehicle) => {
      if (vehicle.isArchived) {
        return false;
      }
      if (!scopedDepartmentName) {
        return true;
      }
      return Boolean(
        vehicle.departmentName &&
          filterByDepartment([{ departmentName: vehicle.departmentName }], scopedDepartmentName)
            .length > 0,
      );
    },
  );
  const scopedVehicleIds = new Set(allVehicles.map((vehicle) => vehicle.id));

  if (allVehicles.length === board.allVehicles.length) {
    return board;
  }

  const activeVehicles = board.activeVehicles.filter((vehicle) => scopedVehicleIds.has(vehicle.id));
  const repairVehicles = board.repairVehicles.filter((vehicle) => scopedVehicleIds.has(vehicle.id));
  const weightReportRows = board.weightReportRows.filter(
    (row) => row.vehicleId === null || scopedVehicleIds.has(row.vehicleId),
  );
  const fuelReportRows = board.fuelReportRows.filter(
    (row) => row.vehicleId === null || scopedVehicleIds.has(row.vehicleId),
  );
  const highestFuelVehicle =
    [...allVehicles]
      .sort(
        (left, right) =>
          right.fuelReports.reduce((sum, report) => sum + report.fuelLiters, 0) -
          left.fuelReports.reduce((sum, report) => sum + report.fuelLiters, 0),
      )[0]?.plate ?? "";
  const mostRepairedVehicle =
    [...allVehicles].sort((left, right) => right.repairHistory.length - left.repairHistory.length)[0]?.plate ?? "";

  return {
    ...board,
    allVehicles,
    activeVehicles,
    repairVehicles,
    totalVehicles: allVehicles.length,
    activeCount: activeVehicles.length,
    repairCount: repairVehicles.length,
    insuranceDueCount: allVehicles.filter((vehicle) => vehicle.insurance.reminderDue).length,
    inspectionDueCount: allVehicles.filter((vehicle) => vehicle.inspection.reminderDue).length,
    weightReportRows,
    fuelReportRows,
    highestFuelVehicle,
    mostRepairedVehicle,
  };
}
