import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import {
  getDepartments,
  getEmployee,
  getEmployeeTransfers,
  getJobs,
  getManagers,
  requireHrSpecialistAccess,
} from "@/lib/hr";

import { RegistryPage } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";

type PageProps = {
  searchParams: Promise<{ employeeId?: string | string[] }>;
};

export default async function HrTransfersPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const access = await requireHrSpecialistAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const params = await searchParams;
  const rawEmployeeId = Array.isArray(params.employeeId) ? params.employeeId[0] : params.employeeId;
  const selectedEmployeeId = Number(rawEmployeeId);
  const selectedEmployee = Number.isFinite(selectedEmployeeId)
    ? await getEmployee(session, selectedEmployeeId).catch(() => null)
    : null;
  const [departments, jobs, managers, transferRecords] = await Promise.all([
    getDepartments(session),
    getJobs(session),
    getManagers(session),
    getEmployeeTransfers(session),
  ]);

  return (
    <>
      <WorkspaceHeader
        title="Шилжилт хөдөлгөөн"
        subtitle="Хэлтэс, албан тушаал, шууд удирдлага өөрчлөх бүртгэл"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Шилжилт хөдөлгөөний бүртгэл"
      />
      <HrSectionNav />
      <RegistryPage
        title="Шилжилт хөдөлгөөний жагсаалт"
        description="Өмнөх мэдээллийг харж, шинэ хэлтэс, албан тушаал эсвэл удирдлага сонгоод тушаал, шийдвэрийн хавсралтыг бүртгэнэ."
        submitEndpoint="/api/hr/transfers"
        submitLabel="Шилжилт бүртгэх"
        successMessage="Шилжилт хөдөлгөөн бүртгэгдлээ."
        records={transferRecords.map((record) => ({
          id: record.id,
          employeeName: record.employeeName,
          date: record.date,
          fromDepartment: record.oldDepartmentName,
          toDepartment: record.newDepartmentName,
          fromJob: record.oldJobName,
          toJob: record.newJobName,
          fromManager: record.oldManagerName,
          toManager: record.newManagerName,
          note: record.note,
          attachmentName: record.attachmentName || "Байхгүй",
          attachmentHref: record.attachmentUrl || "",
          employeeHref: `/hr/employees/${record.employeeId}`,
        }))}
        columns={[
          { key: "employeeName", label: "Ажилтан", hrefKey: "employeeHref" },
          { key: "date", label: "Огноо" },
          { key: "fromDepartment", label: "Өмнөх хэлтэс" },
          { key: "toDepartment", label: "Шинэ хэлтэс" },
          { key: "fromJob", label: "Өмнөх албан тушаал" },
          { key: "toJob", label: "Шинэ албан тушаал" },
          { key: "fromManager", label: "Өмнөх удирдлага" },
          { key: "toManager", label: "Шинэ удирдлага" },
          { key: "attachmentName", label: "Хавсралт", hrefKey: "attachmentHref" },
        ]}
        fields={[
          "Ажилтан",
          "Хэлтэс",
          "Албан тушаал",
          { label: "Шинэ хэлтэс", name: "newDepartmentId", options: departments },
          { label: "Шинэ албан тушаал", name: "newJobId", options: jobs },
          { label: "Шинэ удирдлага", name: "newManagerId", options: managers },
          { label: "Хүчинтэй огноо", name: "effectiveDate", type: "date", required: true },
          { label: "Шалтгаан", name: "reason", required: true },
        ]}
        selectedEmployee={selectedEmployee}
      />
    </>
  );
}
