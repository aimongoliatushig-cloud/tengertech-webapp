import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
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
  const activeEmployees = employees.filter(
    (employee) => employee.active && !["archived", "resigned", "terminated"].includes(employee.statusKey),
  );
  const archivedEmployees = employees.filter(
    (employee) => !employee.active || ["archived", "resigned", "terminated"].includes(employee.statusKey),
  );
  const getEmployeeDepartmentOptionId = (employee: (typeof activeEmployees)[number]) =>
    employee.departmentId ? String(employee.departmentId) : employee.departmentName;
  const departmentOptions = Array.from(
    new Map(
      activeEmployees
        .filter((employee) => employee.departmentName)
        .map((employee) => [
          getEmployeeDepartmentOptionId(employee),
          { id: getEmployeeDepartmentOptionId(employee), name: employee.departmentName },
        ]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
  const jobOptions = Array.from(
    new Map(
      activeEmployees
        .filter((employee) => employee.departmentName && employee.jobTitle)
        .map((employee) => {
          const departmentId = getEmployeeDepartmentOptionId(employee);
          return [
            `${departmentId}:${employee.jobTitle}`,
            { id: employee.jobTitle, name: employee.jobTitle, departmentId },
          ];
        }),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
  const employeeOptions = activeEmployees
    .filter((employee) => employee.departmentName)
    .map((employee) => ({
      id: employee.id,
      name: [employee.name, employee.departmentName, employee.jobTitle].filter(Boolean).join(" · "),
      departmentId: getEmployeeDepartmentOptionId(employee),
      jobTitle: employee.jobTitle || "",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));

  return (
    <>
      <WorkspaceHeader
        title="Ажлаас чөлөөлөх"
        subtitle="Ажилтныг ажлаас чөлөөлөх шийдвэр, шалтгаан, хавсралтыг бүртгээд идэвхтэй жагсаалтаас хасна"
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationCount={archivedEmployees.length}
        notificationNote="Ажлаас чөлөөлсөн бүртгэл"
      />
      <HrSectionNav />
      <RegistryPage
        title="Ажлаас чөлөөлсөн ажилтнууд"
        description="Ажлаас чөлөөлөх огноо, шалтгаан, тушаал/шийдвэрийн хавсралтыг бүртгэнэ. Энэ үйлдлийг зөвхөн HR мэргэжилтэн хийнэ."
        submitEndpoint="/api/hr/employees/:employeeId/terminate"
        submitLabel="Ажлаас чөлөөлөх"
        successMessage="Ажилтны төлөв Ажлаас чөлөөлсөн боллоо."
        hideCreateAnchor
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
          {
            label: "Хэлтэс",
            name: "departmentId",
            options: departmentOptions,
            defaultValue: selectedEmployee?.departmentId ? String(selectedEmployee.departmentId) : "",
            placeholder: "Хэлтэс сонгох",
          },
          {
            label: "Албан тушаал",
            name: "jobTitle",
            options: jobOptions,
            defaultValue: selectedEmployee?.jobTitle || "",
            placeholder: "Албан тушаал сонгох",
          },
          {
            label: "Ажилтан",
            name: "employeeId",
            options: employeeOptions,
            defaultValue: selectedEmployee?.id ? String(selectedEmployee.id) : "",
            required: true,
            placeholder: "Ажилтан сонгох",
          },
          { label: "Ажлаас чөлөөлсөн огноо", name: "terminationDate", type: "date", required: true },
          { label: "Тушаалын дугаар", name: "orderNumber", placeholder: "Заавал биш" },
          {
            label: "Ажлаас чөлөөлөх шалтгаан",
            name: "reason",
            required: true,
            options: [
              { id: "Өөрийн хүсэлтээр", name: "Өөрийн хүсэлтээр" },
              { id: "Гэрээ дууссан", name: "Гэрээ дууссан" },
              { id: "Сахилгын шийтгэл", name: "Сахилгын шийтгэл" },
              { id: "Эрүүл мэндийн шалтгаан", name: "Эрүүл мэндийн шалтгаан" },
              { id: "Тэтгэвэрт гарсан", name: "Тэтгэвэрт гарсан" },
              { id: "Бусад", name: "Бусад" },
            ],
          },
          { label: "Чөлөөлсөн архивын дугаар", name: "archiveNumber", placeholder: "Заавал биш" },
          { label: "Тайлбар", name: "note", type: "textarea", placeholder: "Нэмэлт тайлбар бичих" },
        ]}
        selectedEmployee={selectedEmployee}
      />
    </>
  );
}
