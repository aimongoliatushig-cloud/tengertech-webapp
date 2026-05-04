import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployee, getEmployees, requireHrSpecialistAccess } from "@/lib/hr";

import { RegistryPage } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ employeeId?: string | string[] }>;
};

export default async function HrArchivePage({ searchParams }: PageProps) {
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
  const employees = await getEmployees(session).catch(() => []);
  const archivedEmployees = employees.filter(
    (employee) => !employee.active || ["archived", "resigned", "terminated"].includes(employee.statusKey),
  );

  return (
    <>
      <WorkspaceHeader
        title="Архив / ажлаас гаралт"
        subtitle="Ажлаас гарсан ажилтны шийдвэр, шалтгаан, хавсралтыг бүртгээд ажилтныг active жагсаалтаас архивлана"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={archivedEmployees.length}
        notificationNote="Архивын бүртгэл"
      />
      <HrSectionNav />
      <RegistryPage
        title="Ажлаас гарсан болон архивлагдсан ажилтнууд"
        description="Ажлаас гарах огноо, шалтгаан, тушаал/шийдвэрийн хавсралтыг бүртгэнэ. Энэ үйлдлийг зөвхөн HR мэргэжилтэн хийнэ."
        submitEndpoint={selectedEmployee ? `/api/hr/employees/${selectedEmployee.id}/terminate` : undefined}
        submitLabel="Ажлаас гаргах"
        successMessage="Ажилтан ажлаас гарсан төлөвтэй архивлагдлаа."
        records={archivedEmployees.map((employee) => ({
          id: employee.id,
          employeeName: employee.name,
          departmentName: employee.departmentName,
          jobTitle: employee.jobTitle,
          statusLabel: employee.statusLabel,
          href: `/hr/employees/${employee.id}`,
        }))}
        columns={[
          { key: "employeeName", label: "Ажилтан", hrefKey: "href" },
          { key: "departmentName", label: "Хэлтэс" },
          { key: "jobTitle", label: "Албан тушаал" },
          { key: "statusLabel", label: "Төлөв" },
        ]}
        fields={[
          "Ажилтан",
          "Хэлтэс",
          "Албан тушаал",
          { label: "Ажлаас гарсан огноо", name: "terminationDate", type: "date", required: true },
          {
            label: "Ажлаас гарах шалтгаан",
            name: "reason",
            required: true,
            options: [
              { id: "Өөрийн хүсэлтээр", name: "Өөрийн хүсэлтээр" },
              { id: "Гэрээ дууссан", name: "Гэрээ дууссан" },
              { id: "Сахилгын үндэслэлээр", name: "Сахилгын үндэслэлээр" },
              { id: "Эрүүл мэндийн шалтгаан", name: "Эрүүл мэндийн шалтгаан" },
              { id: "Тэтгэвэрт гарсан", name: "Тэтгэвэрт гарсан" },
              { id: "Бусад", name: "Бусад" },
            ],
          },
          { label: "Тайлбар", name: "note" },
        ]}
        selectedEmployee={selectedEmployee}
      />
    </>
  );
}
