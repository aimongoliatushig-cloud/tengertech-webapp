"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { requireSession } from "@/lib/auth";
import {
  notifyProcurementStageChanged,
} from "@/lib/procurement-notifications";
import {
  approveProcurementDirectorDecision,
  attachProcurementFinalOrder,
  cancelProcurementRequest,
  createProcurementSupplier,
  createProcurementRequest,
  deleteProcurementSupplier,
  deleteProcurementPackage,
  markProcurementContractSigned,
  markProcurementDone,
  markProcurementPaid,
  markProcurementReceived,
  moveProcurementToFinanceReview,
  prepareProcurementOrder,
  recordProcurementPackageCeoOrder,
  saveProcurementPackage,
  submitProcurementForQuotation,
  submitProcurementQuotations,
  loadProcurementMeta,
  loadProcurementRequestDetail,
  loadProcurementSuppliers,
  updateProcurementSupplier,
  uploadProcurementAttachment,
  startProcurementContractDraft,
  startProcurementOrderDraft,
  uploadProcurementOrderDraft,
} from "@/lib/procurement";
import { pathWithActionMessage } from "@/lib/ui-context";

function getConnectionOverrides() {
  return requireSession().then((session) => ({
    login: session.login,
    password: session.password,
  }));
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string) {
  return Number(getString(formData, key) || 0);
}

function getRedirectPath(formData: FormData, fallback: string) {
  const redirectPath = getString(formData, "redirect_path");
  return redirectPath.startsWith("/procurement") ? redirectPath : fallback;
}

function redirectWithMessage(path: string, kind: "error" | "notice", message: string) {
  redirect(pathWithActionMessage(path, kind, message));
}

function isRedirectException(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

function isFinanceReviewAutoAdvanced(stateCode?: string) {
  return [
    "finance_review",
    "admin_review",
    "ceo_decision",
    "ceo_order_uploaded",
    "legal_contract_draft",
    "payment_pending",
  ].includes(stateCode || "");
}

function hasCompleteInvoicePackages(request: {
  packages?: Array<{ is_complete?: boolean; lines?: unknown[] }>;
  unassigned_lines?: unknown[];
  lines?: Array<{ package_id?: number | null }>;
  quotations?: Array<{ is_selected?: boolean }>;
}) {
  const packages = request.packages || [];
  if (packages.length) {
    const unassignedCount =
      request.unassigned_lines?.length ??
      request.lines?.filter((line) => !line.package_id).length ??
      0;
    return unassignedCount === 0 && packages.every((pack) => pack.lines?.length && pack.is_complete);
  }
  return Boolean(request.quotations?.some((quotation) => quotation.is_selected));
}

function shouldMoveToFinanceReviewAfterInvoice(request: Parameters<typeof hasCompleteInvoicePackages>[0] & {
  state?: { code?: string };
}) {
  return (
    !isFinanceReviewAutoAdvanced(request.state?.code) &&
    ["submitted", "quote", "quote_collection", "quotations_ready"].includes(request.state?.code || "") &&
    hasCompleteInvoicePackages(request)
  );
}

function getCreateRequestErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("top-secret records") ||
    message.includes("'read' access") ||
    message.includes("fleet.vehicle")
  ) {
    return "Холбоотой машины мэдээлэл унших эрхийн зөрчил гарлаа. Хуудсаа шинэчлээд дахин оролдоно уу. Алдаа хэвээр байвал municipal_repair_workflow module upgrade хийнэ.";
  }
  return message || "Хүсэлт үүсгэх үед алдаа гарлаа.";
}

function isDepartmentHeadSession(session: Awaited<ReturnType<typeof requireSession>>) {
  return session.role === "project_manager" || Boolean(session.groupFlags?.municipalDepartmentHead);
}

function normalizeName(value?: string | null) {
  return (value || "").trim().toLocaleLowerCase("mn-MN");
}

async function encodeFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    name: file.name,
    mimetype: file.type || "application/octet-stream",
    data: buffer.toString("base64"),
  };
}

async function uploadFilesToRequest(
  requestId: number,
  files: File[],
  target: "request" | "document" | "quotation" | "line",
  connectionOverrides: Awaited<ReturnType<typeof getConnectionOverrides>>,
  extra: Record<string, unknown> = {},
) {
  const uploadedIds: number[] = [];
  for (const file of files) {
    const encoded = await encodeFile(file);
    const attachment = await uploadProcurementAttachment(
      requestId,
      {
        ...encoded,
        target,
        ...extra,
      },
      connectionOverrides,
    );
    uploadedIds.push(attachment.id);
  }
  return uploadedIds;
}

function getFiles(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

function revalidateProcurementPaths(requestId?: number) {
  revalidatePath("/procurement");
  revalidatePath("/procurement/assigned");
  revalidatePath("/procurement/dashboard");
  revalidatePath("/procurement/new");
  if (requestId) {
    revalidatePath(`/procurement/${requestId}`);
  }
}

export async function createProcurementRequestAction(formData: FormData) {
  const session = await requireSession();
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const title = getString(formData, "title");
  const projectId = getString(formData, "project_id");
  const taskId = getString(formData, "task_id");
  const vehicleId = getString(formData, "vehicle_id");
  let departmentId = getString(formData, "department_id");
  const storekeeperId = getString(formData, "responsible_storekeeper_user_id");
  const relationType = getString(formData, "relation_type");
  const repairNeed = getString(formData, "repair_need");
  const lineNames = formData.getAll("line_name").map((item) => String(item).trim());
  const lineSpecs = formData.getAll("line_specification").map((item) => String(item).trim());
  const lineQuantities = formData.getAll("line_quantity").map((item) => Number(String(item || "0")));
  const lineUoms = formData.getAll("line_uom_id").map((item) => Number(String(item || "0")));
  const lineUomNames = formData.getAll("line_uom_name").map((item) => String(item).trim());
  const linePrices = formData.getAll("line_approx_unit_price").map((item) => Number(String(item || "0")));

  if (!title) {
    redirectWithMessage("/procurement/new", "error", "Гарчиг заавал оруулна уу.");
  }

  if (relationType !== "project" && relationType !== "vehicle") {
    redirectWithMessage("/procurement/new", "error", "Худалдан авалтын төрлөө сонгоно уу.");
  }

  if (relationType === "project" && !projectId && !taskId) {
    redirectWithMessage("/procurement/new", "error", "Төсөлтэй холбоотой хүсэлтэд төсөл эсвэл даалгавар сонгоно уу.");
  }

  if (relationType === "vehicle" && !vehicleId) {
    redirectWithMessage("/procurement/new", "error", "Машин / засвартай холбоотой хүсэлтэд авто тээвэр сонгоно уу.");
  }

  if (relationType === "project" && vehicleId) {
    redirectWithMessage("/procurement/new", "error", "Нэг хүсэлтийг төсөл болон машинтай зэрэг холбох боломжгүй.");
  }

  if (relationType === "vehicle" && (projectId || taskId)) {
    redirectWithMessage("/procurement/new", "error", "Нэг хүсэлтийг төсөл болон машинтай зэрэг холбох боломжгүй.");
  }

  if (isDepartmentHeadSession(session)) {
    const departmentScopeName = await loadSessionDepartmentName(session);
    const meta = await loadProcurementMeta(connectionOverrides).catch(() => null);
    const scopedDepartment = departmentScopeName
      ? meta?.departments.find((department) => normalizeName(department.name) === normalizeName(departmentScopeName))
      : null;
    departmentId = scopedDepartment?.id ? String(scopedDepartment.id) : "";
  }

  const lines = lineNames
    .map((lineName, index) => ({
      product_name: lineName,
      specification: lineSpecs[index] || "",
      quantity: lineQuantities[index] || 0,
      uom_id: lineUoms[index] || undefined,
      unit_of_measure: lineUomNames[index] || undefined,
      approx_unit_price: linePrices[index] || 0,
      form_index: index + 1,
    }))
    .filter((line) => line.product_name && line.quantity > 0);

  if (!lines.length) {
    redirectWithMessage("/procurement/new", "error", "Хамгийн багадаа нэг мөр оруулна уу.");
  }

  let createdRequestId = 0;
  try {
    const createdRequest = await createProcurementRequest(
      {
        title,
        project_id: relationType === "project" ? projectId || undefined : undefined,
        task_id: relationType === "project" ? taskId || undefined : undefined,
        vehicle_id: relationType === "vehicle" ? vehicleId || undefined : undefined,
        department_id: departmentId || undefined,
        description: [getString(formData, "description"), repairNeed ? `Засварын хэрэгцээ: ${repairNeed}` : ""]
          .filter(Boolean)
          .join("\n\n"),
        procurement_type: relationType === "vehicle" ? "repair_part" : getString(formData, "procurement_type") || "goods",
        urgency: getString(formData, "urgency") || "medium",
        required_date: getString(formData, "required_date") || undefined,
        responsible_storekeeper_user_id: storekeeperId ? Number(storekeeperId) : undefined,
        notes_user: getString(formData, "notes_user") || repairNeed || undefined,
        lines,
      },
      connectionOverrides,
    );
    createdRequestId = createdRequest.id;

    const requestFiles = getFiles(formData, "request_files");
    if (requestFiles.length) {
      await uploadFilesToRequest(createdRequest.id, requestFiles, "document", connectionOverrides, {
        document_type: "other",
        note: getString(formData, "notes_user") || undefined,
      });
    }

    for (const [index, line] of createdRequest.lines.entries()) {
      const sourceLine = lines[index];
      const lineFiles = getFiles(formData, `line_image_${sourceLine?.form_index || line.sequence}`);
      if (lineFiles.length) {
        await uploadFilesToRequest(createdRequest.id, lineFiles, "line", connectionOverrides, {
          document_type: "product_image",
          line_id: line.id,
          note: line.product_name || undefined,
        });
      }
    }

    const submittedRequest = await submitProcurementForQuotation(createdRequest.id, connectionOverrides);
    await notifyProcurementStageChanged("request_created", submittedRequest);
    revalidateProcurementPaths(createdRequest.id);
    revalidatePath("/notifications");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      "/procurement/new",
      "error",
      getCreateRequestErrorMessage(error),
    );
  }

  redirect(`/procurement/${createdRequestId}?notice=${encodeURIComponent("Хүсэлт амжилттай үүслээ.")}`);
}

export async function submitProcurementQuotationsAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  let packageId = getNumber(formData, "package_id");
  const redirectPath = getRedirectPath(formData, requestId ? `/procurement/${requestId}` : "/procurement");
  if (!requestId) {
    redirectWithMessage("/procurement", "error", "Хүсэлтийн дугаар буруу байна.");
  }

  try {
    const lineIds = formData
      .getAll("line_ids")
      .map((value) => Number(String(value || "0")))
      .filter(Boolean);
    if (lineIds.length) {
      await saveProcurementPackage(
        requestId,
        {
          package_id: packageId || undefined,
          name: getString(formData, "package_name") || "Нэг багц",
          note: getString(formData, "package_note") || undefined,
          line_ids: lineIds,
        },
        connectionOverrides,
      );
      if (!packageId) {
        const detail = await loadProcurementRequestDetail(requestId, connectionOverrides);
        const selectedLineIds = new Set(lineIds);
        const createdPackage = detail.packages.find((pack) =>
          pack.lines.some((line) => selectedLineIds.has(line.id)),
        );
        packageId = createdPackage?.id || 0;
      }
    }

    const quotations = await Promise.all(
      [1].map(async (index) => {
        const amountTotal = getNumber(formData, `amount_total_${index}`);
        if (amountTotal <= 0) {
          throw new Error("Багц бүрийн нэхэмжлэхийн дүнг 0-ээс ихээр оруулна уу.");
        }
        const file = getFiles(formData, `quote_file_${index}`)[0];
        const attachmentIds =
          file
            ? await uploadFilesToRequest(requestId, [file], "quotation", connectionOverrides, {
                document_type: "quote",
                package_id: packageId || undefined,
              })
            : [];

        return {
          supplier_id: getNumber(formData, `supplier_id_${index}`),
          amount_total: amountTotal,
          is_selected: index === 1,
          attachment_ids: attachmentIds,
        };
      }),
    );

    let updatedRequest = await submitProcurementQuotations(
      requestId,
      {
        package_id: packageId || undefined,
        quotations,
      },
      connectionOverrides,
    );
    let notificationAction: Parameters<typeof notifyProcurementStageChanged>[0] = "submit_quotations";
    if (shouldMoveToFinanceReviewAfterInvoice(updatedRequest)) {
      updatedRequest = await moveProcurementToFinanceReview(requestId, connectionOverrides);
      notificationAction = "move_to_finance_review";
    }
    const autoAdvanced = isFinanceReviewAutoAdvanced(updatedRequest.state?.code);
    await notifyProcurementStageChanged(notificationAction, updatedRequest, packageId || undefined);

    revalidateProcurementPaths(requestId);
    redirectWithMessage(
      redirectPath,
      "notice",
      autoAdvanced
        ? "Нэхэмжлэх хадгалагдаж дараагийн санхүүгийн шат руу шилжлээ."
        : "Нэхэмжлэх амжилттай хадгалагдлаа.",
    );
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "Нэхэмжлэх хадгалах үед алдаа гарлаа.",
    );
  }
}

export async function saveProcurementPackageAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  const packageId = getNumber(formData, "package_id");
  const redirectPath = getRedirectPath(formData, requestId ? `/procurement/${requestId}` : "/procurement");
  if (!requestId) {
    redirectWithMessage("/procurement", "error", "Хүсэлтийн дугаар буруу байна.");
  }

  const lineIds = formData
    .getAll("line_ids")
    .map((value) => Number(String(value || "0")))
    .filter(Boolean);

  try {
    await saveProcurementPackage(
      requestId,
      {
        package_id: packageId || undefined,
        name: getString(formData, "package_name"),
        note: getString(formData, "package_note") || undefined,
        line_ids: lineIds,
      },
      connectionOverrides,
    );

    revalidateProcurementPaths(requestId);
    redirectWithMessage(redirectPath, "notice", "Багц амжилттай хадгалагдлаа.");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "Багц хадгалах үед алдаа гарлаа.",
    );
  }
}

export async function deleteProcurementPackageAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  const packageId = getNumber(formData, "package_id");
  const redirectPath = getRedirectPath(formData, requestId ? `/procurement/${requestId}` : "/procurement");
  if (!requestId || !packageId) {
    redirectWithMessage("/procurement", "error", "Багцын мэдээлэл буруу байна.");
  }

  try {
    await deleteProcurementPackage(requestId, { package_id: packageId }, connectionOverrides);
    revalidateProcurementPaths(requestId);
    redirectWithMessage(redirectPath, "notice", "Багц устгагдлаа.");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "Багц устгах үед алдаа гарлаа.",
    );
  }
}

export async function createProcurementSupplierAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  const redirectPath = getRedirectPath(formData, requestId ? `/procurement/${requestId}` : "/procurement");
  if (!requestId) {
    redirectWithMessage("/procurement", "error", "Хүсэлтийн дугаар буруу байна.");
  }

  try {
    await createProcurementSupplier(
      {
        name: getString(formData, "supplier_name"),
        vat: getString(formData, "supplier_vat") || undefined,
        phone: getString(formData, "supplier_phone") || undefined,
        email: getString(formData, "supplier_email") || undefined,
        street: getString(formData, "supplier_street") || undefined,
      },
      connectionOverrides,
    );
    revalidateProcurementPaths(requestId);
    redirectWithMessage(redirectPath, "notice", "Нийлүүлэгч нэмэгдлээ. Жагсаалтаас сонгож саналаа хадгална уу.");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "Нийлүүлэгч нэмэх үед алдаа гарлаа.",
    );
  }
}

export async function createProcurementSupplierInlineAction(payload: { name?: string }) {
  const connectionOverrides = await getConnectionOverrides();
  const name = String(payload.name || "").trim();

  if (!name) {
    return { ok: false, error: "Нийлүүлэгчийн нэр оруулна уу." };
  }

  try {
    const existingSuppliers = await loadProcurementSuppliers({ search: name }, connectionOverrides);
    const duplicate = existingSuppliers.find((supplier) => normalizeName(supplier.name) === normalizeName(name));
    if (duplicate) {
      return { ok: false, error: "Ийм нэртэй нийлүүлэгч байна.", supplier: duplicate };
    }

    const supplier = await createProcurementSupplier({ name }, connectionOverrides);
    revalidatePath("/procurement");
    revalidatePath("/procurement/assigned");
    revalidatePath("/procurement/suppliers");
    return { ok: true, supplier };
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Нийлүүлэгч нэмэх үед алдаа гарлаа.",
    };
  }
}

export async function createProcurementSupplierDirectoryAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const redirectPath = getRedirectPath(formData, "/procurement/suppliers");

  try {
    await createProcurementSupplier(
      {
        name: getString(formData, "supplier_name"),
        vat: getString(formData, "supplier_vat") || undefined,
        phone: getString(formData, "supplier_phone") || undefined,
        email: getString(formData, "supplier_email") || undefined,
        street: getString(formData, "supplier_street") || undefined,
      },
      connectionOverrides,
    );
    revalidatePath("/procurement/suppliers");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "Нийлүүлэгч нэмэх үед алдаа гарлаа.",
    );
  }

  redirectWithMessage(redirectPath, "notice", "Нийлүүлэгч нэмэгдлээ.");
}

export async function updateProcurementSupplierAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const supplierId = getNumber(formData, "supplier_id");
  const redirectPath = getRedirectPath(formData, "/procurement/suppliers");
  if (!supplierId) {
    redirectWithMessage(redirectPath, "error", "Нийлүүлэгчийн мэдээлэл буруу байна.");
  }

  try {
    await updateProcurementSupplier(
      supplierId,
      {
        name: getString(formData, "supplier_name"),
        vat: getString(formData, "supplier_vat") || undefined,
        phone: getString(formData, "supplier_phone") || undefined,
        email: getString(formData, "supplier_email") || undefined,
        street: getString(formData, "supplier_street") || undefined,
      },
      connectionOverrides,
    );
    revalidatePath("/procurement/suppliers");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "Нийлүүлэгч засах үед алдаа гарлаа.",
    );
  }

  redirectWithMessage(redirectPath, "notice", "Нийлүүлэгч шинэчлэгдлээ.");
}

export async function deleteProcurementSupplierAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const supplierId = getNumber(formData, "supplier_id");
  const redirectPath = getRedirectPath(formData, "/procurement/suppliers");
  if (!supplierId) {
    redirectWithMessage(redirectPath, "error", "Нийлүүлэгчийн мэдээлэл буруу байна.");
  }

  try {
    await deleteProcurementSupplier(supplierId, connectionOverrides);
    revalidatePath("/procurement/suppliers");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "Нийлүүлэгч устгах үед алдаа гарлаа.",
    );
  }

  redirectWithMessage(redirectPath, "notice", "Нийлүүлэгч идэвхгүй боллоо.");
}

export async function runProcurementWorkflowAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  const action = getString(formData, "workflow_action");
  const redirectPath = getRedirectPath(formData, requestId ? `/procurement/${requestId}` : "/procurement");
  const note = getString(formData, "note") || undefined;
  let notificationPackageId = getNumber(formData, "package_id") || undefined;

  if (!requestId || !action) {
    redirectWithMessage("/procurement", "error", "Үйлдлийн мэдээлэл дутуу байна.");
  }

  try {
    if (action === "submit_for_quotation") {
      await submitProcurementForQuotation(requestId, connectionOverrides);
    } else if (action === "move_to_finance_review") {
      const updatedRequest = await moveProcurementToFinanceReview(requestId, connectionOverrides);
      await notifyProcurementStageChanged("move_to_finance_review", updatedRequest, notificationPackageId);
    } else if (action === "prepare_order") {
      const updatedRequest = await prepareProcurementOrder(requestId, connectionOverrides);
      await notifyProcurementStageChanged("prepare_order", updatedRequest, notificationPackageId);
    } else if (action === "start_contract_draft") {
      const packageId = getNumber(formData, "package_id");
      const updatedRequest = await startProcurementContractDraft(
        requestId,
        { package_id: packageId || undefined, note },
        connectionOverrides,
      );
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged("start_contract_draft", updatedRequest, notificationPackageId);
    } else if (action === "start_order_draft") {
      const packageId = getNumber(formData, "package_id");
      const updatedRequest = await startProcurementOrderDraft(
        requestId,
        { package_id: packageId || undefined, note },
        connectionOverrides,
      );
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged("start_order_draft", updatedRequest, notificationPackageId);
    } else if (action === "upload_order_draft") {
      const packageId = getNumber(formData, "package_id");
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "order_draft",
        package_id: packageId || undefined,
        note,
      });
      const updatedRequest = await uploadProcurementOrderDraft(
        requestId,
        { package_id: packageId || undefined, note },
        connectionOverrides,
      );
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged("upload_order_draft", updatedRequest, notificationPackageId);
    } else if (action === "director_decision") {
      const updatedRequest = await approveProcurementDirectorDecision(
        requestId,
        {
          selected_quotation_id: getNumber(formData, "selected_quotation_id") || undefined,
        },
        connectionOverrides,
      );
      await notifyProcurementStageChanged("director_decision", updatedRequest, notificationPackageId);
    } else if (action === "attach_final_order") {
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "director_order_final",
        note,
      });
      const updatedRequest = await attachProcurementFinalOrder(requestId, { note }, connectionOverrides);
      await notifyProcurementStageChanged("attach_final_order", updatedRequest, notificationPackageId);
    } else if (action === "record_package_ceo_order") {
      const packageId = getNumber(formData, "package_id");
      const files = getFiles(formData, "document_files");
      const attachmentIds = await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "director_order_final",
        package_id: packageId || undefined,
        note,
      });
      const updatedRequest = await recordProcurementPackageCeoOrder(
        requestId,
        {
          package_id: packageId || undefined,
          selected_quotation_id: getNumber(formData, "selected_quotation_id") || undefined,
          order_number: getString(formData, "order_number") || undefined,
          order_date: getString(formData, "order_date") || undefined,
          note,
          attachment_ids: attachmentIds,
        },
        connectionOverrides,
      );
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged("record_package_ceo_order", updatedRequest, notificationPackageId);
    } else if (action === "mark_contract_signed") {
      const packageId = getNumber(formData, "package_id");
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "contract_final",
        package_id: packageId || undefined,
        note,
      });
      const updatedRequest = await markProcurementContractSigned(requestId, { package_id: packageId || undefined, note }, connectionOverrides);
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged("mark_contract_signed", updatedRequest, notificationPackageId);
    } else if (action === "mark_paid") {
      const packageId = getNumber(formData, "package_id");
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "payment_proof",
        note,
      });
      const updatedRequest = await markProcurementPaid(
        requestId,
        {
          package_id: packageId || undefined,
          selected_quotation_id: getNumber(formData, "selected_quotation_id") || undefined,
          paid_amount: getNumber(formData, "paid_amount") || undefined,
          payment_reference: getString(formData, "payment_reference") || undefined,
          payment_date: getString(formData, "payment_date") || undefined,
          note,
        },
        connectionOverrides,
      );
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged("mark_paid", updatedRequest, notificationPackageId);
    } else if (action === "mark_received") {
      const packageId = getNumber(formData, "package_id");
      const receivedNote = note || "Dashboard дээр хүлээлгэн өгсөн төлөв баталгаажуулав.";
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "receipt_proof",
        package_id: packageId || undefined,
        note: receivedNote,
      });
      let updatedRequest = await markProcurementReceived(requestId, { package_id: packageId || undefined, note: receivedNote }, connectionOverrides);
      const allPackagesDone = updatedRequest.packages.length
        ? updatedRequest.packages.every((pack) => ["done", "cancelled"].includes(pack.route_state?.code || ""))
        : updatedRequest.receipt_status.code === "received";
      if (allPackagesDone) {
        updatedRequest = await markProcurementDone(requestId, connectionOverrides);
      }
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged("mark_received", updatedRequest, notificationPackageId);
    } else if (action === "mark_done") {
      const updatedRequest = await markProcurementDone(requestId, connectionOverrides);
      await notifyProcurementStageChanged("mark_done", updatedRequest, notificationPackageId);
    } else if (action === "cancel") {
      const updatedRequest = await cancelProcurementRequest(requestId, connectionOverrides);
      await notifyProcurementStageChanged("cancel", updatedRequest, notificationPackageId);
    } else {
      redirectWithMessage(redirectPath, "error", "Танигдаагүй үйлдэл байна.");
    }

    revalidateProcurementPaths(requestId);
    revalidatePath("/notifications");
    redirectWithMessage(redirectPath, "notice", "Үйлдэл амжилттай хадгалагдлаа.");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "Үйлдэл гүйцэтгэх үед алдаа гарлаа.",
    );
  }
}
