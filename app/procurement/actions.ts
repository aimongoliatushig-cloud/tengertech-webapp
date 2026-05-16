"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { requireSession } from "@/lib/auth";
import {
  notifyProcurementStageChanged,
  type ProcurementNotificationAction,
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
  loadProcurementSuppliers,
  updateProcurementSupplier,
  uploadProcurementAttachment,
} from "@/lib/procurement";

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

function redirectWithMessage(path: string, kind: "error" | "notice", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}`);
}

function isRedirectException(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
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
  const packageId = getNumber(formData, "package_id");
  if (!requestId) {
    redirectWithMessage("/procurement", "error", "Хүсэлтийн дугаар буруу байна.");
  }

  try {
    const quotations = await Promise.all(
      [1, 2, 3].map(async (index) => {
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
          amount_total: getNumber(formData, `amount_total_${index}`),
          attachment_ids: attachmentIds,
        };
      }),
    );

    await submitProcurementQuotations(
      requestId,
      {
        package_id: packageId || undefined,
        quotations,
      },
      connectionOverrides,
    );

    revalidateProcurementPaths(requestId);
    redirect(`/procurement/${requestId}?notice=${encodeURIComponent("Үнийн саналууд амжилттай хадгалагдлаа.")}`);
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      `/procurement/${requestId}`,
      "error",
      error instanceof Error ? error.message : "Үнийн санал хадгалах үед алдаа гарлаа.",
    );
  }
}

export async function saveProcurementPackageAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  const packageId = getNumber(formData, "package_id");
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
    redirect(`/procurement/${requestId}?notice=${encodeURIComponent("Багц амжилттай хадгалагдлаа.")}`);
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      `/procurement/${requestId}`,
      "error",
      error instanceof Error ? error.message : "Багц хадгалах үед алдаа гарлаа.",
    );
  }
}

export async function deleteProcurementPackageAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  const packageId = getNumber(formData, "package_id");
  if (!requestId || !packageId) {
    redirectWithMessage("/procurement", "error", "Багцын мэдээлэл буруу байна.");
  }

  try {
    await deleteProcurementPackage(requestId, { package_id: packageId }, connectionOverrides);
    revalidateProcurementPaths(requestId);
    redirect(`/procurement/${requestId}?notice=${encodeURIComponent("Багц устгагдлаа.")}`);
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      `/procurement/${requestId}`,
      "error",
      error instanceof Error ? error.message : "Багц устгах үед алдаа гарлаа.",
    );
  }
}

export async function createProcurementSupplierAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
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
    redirect(`/procurement/${requestId}?notice=${encodeURIComponent("Нийлүүлэгч нэмэгдлээ. Жагсаалтаас сонгож саналаа хадгална уу.")}`);
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      `/procurement/${requestId}`,
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
      "/procurement/suppliers",
      "error",
      error instanceof Error ? error.message : "Нийлүүлэгч нэмэх үед алдаа гарлаа.",
    );
  }

  redirect(`/procurement/suppliers?notice=${encodeURIComponent("Нийлүүлэгч нэмэгдлээ.")}`);
}

export async function updateProcurementSupplierAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const supplierId = getNumber(formData, "supplier_id");
  if (!supplierId) {
    redirectWithMessage("/procurement/suppliers", "error", "Нийлүүлэгчийн мэдээлэл буруу байна.");
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
      "/procurement/suppliers",
      "error",
      error instanceof Error ? error.message : "Нийлүүлэгч засах үед алдаа гарлаа.",
    );
  }

  redirect(`/procurement/suppliers?notice=${encodeURIComponent("Нийлүүлэгч шинэчлэгдлээ.")}`);
}

export async function deleteProcurementSupplierAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const supplierId = getNumber(formData, "supplier_id");
  if (!supplierId) {
    redirectWithMessage("/procurement/suppliers", "error", "Нийлүүлэгчийн мэдээлэл буруу байна.");
  }

  try {
    await deleteProcurementSupplier(supplierId, connectionOverrides);
    revalidatePath("/procurement/suppliers");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      "/procurement/suppliers",
      "error",
      error instanceof Error ? error.message : "Нийлүүлэгч устгах үед алдаа гарлаа.",
    );
  }

  redirect(`/procurement/suppliers?notice=${encodeURIComponent("Нийлүүлэгч идэвхгүй боллоо.")}`);
}

export async function runProcurementWorkflowAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  const action = getString(formData, "workflow_action");
  const note = getString(formData, "note") || undefined;
  let notificationAction: ProcurementNotificationAction | null = null;
  let notificationPackageId = getNumber(formData, "package_id") || undefined;

  if (!requestId || !action) {
    redirectWithMessage("/procurement", "error", "Үйлдлийн мэдээлэл дутуу байна.");
  }

  try {
    if (action === "submit_for_quotation") {
      await submitProcurementForQuotation(requestId, connectionOverrides);
    } else if (action === "move_to_finance_review") {
      const updatedRequest = await moveProcurementToFinanceReview(requestId, connectionOverrides);
      await notifyProcurementStageChanged("move_to_finance_review", updatedRequest);
    } else if (action === "prepare_order") {
      await prepareProcurementOrder(requestId, connectionOverrides);
    } else if (action === "director_decision") {
      await approveProcurementDirectorDecision(
        requestId,
        {
          selected_quotation_id: getNumber(formData, "selected_quotation_id") || undefined,
        },
        connectionOverrides,
      );
    } else if (action === "attach_final_order") {
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "director_order_final",
        note,
      });
      await attachProcurementFinalOrder(requestId, { note }, connectionOverrides);
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
      notificationAction = "record_package_ceo_order";
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged(notificationAction, updatedRequest, notificationPackageId);
    } else if (action === "mark_contract_signed") {
      const packageId = getNumber(formData, "package_id");
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "contract_final",
        package_id: packageId || undefined,
        note,
      });
      const updatedRequest = await markProcurementContractSigned(requestId, { package_id: packageId || undefined, note }, connectionOverrides);
      notificationAction = "mark_contract_signed";
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged(notificationAction, updatedRequest, notificationPackageId);
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
      notificationAction = "mark_paid";
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged(notificationAction, updatedRequest, notificationPackageId);
    } else if (action === "mark_received") {
      const packageId = getNumber(formData, "package_id");
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "receipt_proof",
        package_id: packageId || undefined,
        note,
      });
      const updatedRequest = await markProcurementReceived(requestId, { package_id: packageId || undefined, note }, connectionOverrides);
      notificationAction = "mark_received";
      notificationPackageId = packageId || undefined;
      await notifyProcurementStageChanged(notificationAction, updatedRequest, notificationPackageId);
    } else if (action === "mark_done") {
      const updatedRequest = await markProcurementDone(requestId, connectionOverrides);
      notificationAction = "mark_done";
      await notifyProcurementStageChanged(notificationAction, updatedRequest, notificationPackageId);
    } else if (action === "cancel") {
      const updatedRequest = await cancelProcurementRequest(requestId, connectionOverrides);
      notificationAction = "cancel";
      await notifyProcurementStageChanged(notificationAction, updatedRequest, notificationPackageId);
    } else {
      redirectWithMessage(`/procurement/${requestId}`, "error", "Танигдаагүй үйлдэл байна.");
    }

    revalidateProcurementPaths(requestId);
    revalidatePath("/notifications");
    redirect(`/procurement/${requestId}?notice=${encodeURIComponent("Үйлдэл амжилттай хадгалагдлаа.")}`);
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }

    redirectWithMessage(
      `/procurement/${requestId}`,
      "error",
      error instanceof Error ? error.message : "Үйлдэл гүйцэтгэх үед алдаа гарлаа.",
    );
  }
}
