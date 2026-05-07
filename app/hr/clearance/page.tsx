import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getClearanceRecords, getEmployee, getEmployees, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import { RegistryPage } from "../hr-client";

type PageProps = {
  searchParams: Promise<{ employeeId?: string | string[] }>;
};

function todayInUlaanbaatar() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function HrClearancePage({ searchParams }: PageProps) {
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
  const [employees, records] = await Promise.all([
    getEmployees(session).catch(() => []),
    getClearanceRecords(session, selectedEmployee ? selectedEmployee.id : undefined).catch(() => []),
  ]);
  const employeeOptions = employees.map((employee) => ({ id: employee.id, name: employee.name }));
  const registryRecords = records.map((record) => ({
    id: record.id,
    name: record.name,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    departmentId: record.departmentId,
    departmentName: record.departmentName,
    jobTitle: record.jobTitle,
    savedDate: record.savedDate,
    section: record.section,
    sectionLabel: record.sectionLabel,
    state: record.state,
    stateLabel: record.stateLabel,
    note: record.note,
    attachmentIds: record.attachmentIds,
  }));

  return (
    <>
      <WorkspaceHeader
        title="Тойрох хуудас"
        subtitle="Ажилтан ажлаас гарах үед байгууллагын баталгаажуулах checklist-ийг хянах хэсэг"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Тойрох хуудасны бүртгэл"
      />
      <HrSectionNav />
      <RegistryPage
        title="Тойрох хуудасны жагсаалт"
        description="Ажилтны тойрох хуудсыг хадгалсан огноотой нь бүртгэнэ."
        fields={[
          selectedEmployee
            ? { label: "Ажилтан", name: "employeeId", required: true }
            : { label: "Ажилтан", name: "employeeId", required: true, options: employeeOptions },
          { label: "Хадгалсан огноо", name: "savedDate", type: "date", defaultValue: todayInUlaanbaatar(), required: true },
          {
            label: "Шалгах хэсэг",
            name: "section",
            defaultValue: "hr",
            required: true,
            options: [
              { id: "warehouse", name: "Нярав" },
              { id: "it", name: "IT" },
              { id: "finance", name: "Санхүү" },
              { id: "manager", name: "Шууд удирдлага" },
              { id: "hr", name: "HR" },
            ],
          },
          {
            label: "Төлөв",
            name: "state",
            defaultValue: "draft",
            required: true,
            options: [
              { id: "draft", name: "Ноорог" },
              { id: "submitted", name: "Илгээсэн" },
              { id: "pending", name: "Хүлээгдэж байна" },
              { id: "approved", name: "Баталгаажсан" },
              { id: "incomplete", name: "Дутуу" },
              { id: "done", name: "Дууссан" },
            ],
          },
          { label: "Тэмдэглэл", name: "note" },
        ]}
        checklist={["Нярав", "Нягтлан", "IT / тоног төхөөрөмж", "Шууд удирдлага", "Хүний нөөц", "Захиргаа"]}
        selectedEmployee={selectedEmployee}
        submitEndpoint="/api/hr/clearance"
        submitLabel="Тойрох хуудас хадгалах"
        successMessage="Тойрох хуудас хадгалагдлаа."
        records={registryRecords}
        columns={[
          { key: "attachmentIds", label: "Хавсралт", type: "attachments" },
          { key: "employeeName", label: "Ажилтан" },
          { key: "savedDate", label: "Хадгалсан огноо" },
          { key: "sectionLabel", label: "Шалгах хэсэг" },
          { key: "stateLabel", label: "Төлөв" },
          { key: "note", label: "Тэмдэглэл" },
        ]}
        createAnchorLabel="Тойрох хуудас нэмэх"
      />
    </>
  );
}
