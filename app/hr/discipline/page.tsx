import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import {
  getDisciplineActionOptions,
  getDisciplineRecords,
  getDisciplineViolationOptions,
  getEmployees,
  getEmployee,
  requireHrAccess,
} from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import { RegistryPage } from "../hr-client";

type PageProps = {
  searchParams: Promise<{ employeeId?: string | string[] }>;
};

export default async function HrDisciplinePage({ searchParams }: PageProps) {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const params = await searchParams;
  const rawEmployeeId = Array.isArray(params.employeeId) ? params.employeeId[0] : params.employeeId;
  const selectedEmployeeId = Number(rawEmployeeId);
  const selectedEmployee = Number.isFinite(selectedEmployeeId)
    ? await getEmployee(session, selectedEmployeeId).catch(() => null)
    : null;
  const [actionOptions, violationOptions, disciplineRecords, employees] = await Promise.all([
    getDisciplineActionOptions(session),
    getDisciplineViolationOptions(session),
    getDisciplineRecords(session),
    getEmployees(session),
  ]);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const registryRecords = disciplineRecords.map((record) => ({
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    employeeHref: record.employeeId ? `/hr/employees/${record.employeeId}` : "",
    departmentId: record.departmentId,
    departmentName: record.departmentName,
    jobTitle: record.employeeId ? employeeById.get(record.employeeId)?.jobTitle || "" : "",
    violationType: record.violationType,
    violationTypeLabel: record.violationTypeLabel,
    violationDate: record.violationDate,
    actionType: record.actionType,
    actionTypeLabel: record.actionTypeLabel,
    explanation: record.explanation,
    employeeExplanation: record.employeeExplanation,
    stateLabel: record.stateLabel,
    repeatedLabel: record.repeated ? `Давтан (${record.repeatedViolationCount})` : "Үгүй",
    hasAttachmentLabel: record.hasAttachment ? "Байгаа" : "Байхгүй",
  }));

  return (
    <>
      <WorkspaceHeader
        title="Сахилгын бүртгэл"
        subtitle="Ажил үүрэг, чанар, тайлан, хариуцлага, аюулгүй ажиллагаа болон бусад HR сахилгын бүртгэл"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={disciplineRecords.length}
        notificationNote="Сахилгын бүртгэл"
      />
      <HrSectionNav />
      <RegistryPage
        title="Сахилгын бүртгэлийн жагсаалт"
        description="Зөрчлийн төрөл, огноо, ажилтны тайлбар, арга хэмжээ, баталсан хүн болон холбогдох тушаалын мэдээллийг бүртгэнэ."
        fields={[
          "Ажилтан",
          "Хэлтэс",
          "Албан тушаал",
          { label: "Зөрчлийн төрөл", name: "violationType", options: violationOptions, required: true },
          { label: "Зөрчлийн огноо", name: "violationDate", type: "date", required: true },
          { label: "Тайлбар", name: "explanation" },
          { label: "Ажилтны тайлбар", name: "employeeExplanation" },
          { label: "Авсан арга хэмжээ", name: "actionType", options: actionOptions, required: true },
        ]}
        selectedEmployee={selectedEmployee}
        submitEndpoint="/api/hr/discipline"
        submitLabel="Сахилгын бүртгэл үүсгэх"
        successMessage="Сахилгын бүртгэл үүсгэгдлээ."
        records={registryRecords}
        columns={[
          { key: "employeeName", label: "Ажилтан", hrefKey: "employeeHref" },
          { key: "departmentName", label: "Хэлтэс" },
          { key: "violationTypeLabel", label: "Зөрчлийн төрөл" },
          { key: "violationDate", label: "Огноо" },
          { key: "actionTypeLabel", label: "Авсан арга хэмжээ" },
          { key: "stateLabel", label: "Төлөв" },
          { key: "repeatedLabel", label: "Давтан" },
          { key: "hasAttachmentLabel", label: "Хавсралт" },
        ]}
        createAnchorLabel="Сахилгын бүртгэл үүсгэх"
        allowRecordActions
      />
    </>
  );
}
