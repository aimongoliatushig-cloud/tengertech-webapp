"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import {
  approveProcurementDirectorDecision,
  attachProcurementFinalOrder,
  cancelProcurementRequest,
  createProcurementRequest,
  markProcurementContractSigned,
  markProcurementDone,
  markProcurementPaid,
  markProcurementReceived,
  moveProcurementToFinanceReview,
  prepareProcurementOrder,
  submitProcurementForQuotation,
  submitProcurementQuotations,
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
  const connectionOverrides = await getConnectionOverrides();
  const title = getString(formData, "title");
  const projectId = getString(formData, "project_id");
  const taskId = getString(formData, "task_id");
  const departmentId = getString(formData, "department_id");
  const storekeeperId = getString(formData, "responsible_storekeeper_user_id");
  const lineNames = formData.getAll("line_name").map((item) => String(item).trim());
  const lineSpecs = formData.getAll("line_specification").map((item) => String(item).trim());
  const lineQuantities = formData.getAll("line_quantity").map((item) => Number(String(item || "0")));
  const lineUoms = formData.getAll("line_uom_id").map((item) => Number(String(item || "0")));
  const linePrices = formData.getAll("line_approx_unit_price").map((item) => Number(String(item || "0")));

  if (!title || !storekeeperId) {
    redirectWithMessage("/procurement/new", "error", "Гарчиг болон хариуцсан няравыг заавал сонгоно уу.");
  }

  const lines = lineNames
    .map((lineName, index) => ({
      product_name: lineName,
      specification: lineSpecs[index] || "",
      quantity: lineQuantities[index] || 0,
      uom_id: lineUoms[index] || undefined,
      approx_unit_price: linePrices[index] || 0,
      form_index: index + 1,
    }))
    .filter((line) => line.product_name && line.quantity > 0);

  if (!lines.length) {
    redirectWithMessage("/procurement/new", "error", "Хамгийн багадаа нэг мөр оруулна уу.");
  }

  try {
    const createdRequest = await createProcurementRequest(
      {
        title,
        project_id: projectId || undefined,
        task_id: taskId || undefined,
        department_id: departmentId || undefined,
        description: getString(formData, "description"),
        procurement_type: getString(formData, "procurement_type") || "goods",
        urgency: getString(formData, "urgency") || "medium",
        required_date: getString(formData, "required_date") || undefined,
        responsible_storekeeper_user_id: Number(storekeeperId),
        notes_user: getString(formData, "notes_user") || undefined,
        lines,
      },
      connectionOverrides,
    );

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

    revalidateProcurementPaths(createdRequest.id);
    redirect(`/procurement/${createdRequest.id}?notice=${encodeURIComponent("Хүсэлт амжилттай үүслээ.")}`);
  } catch (error) {
    redirectWithMessage(
      "/procurement/new",
      "error",
      error instanceof Error ? error.message : "Хүсэлт үүсгэх үед алдаа гарлаа.",
    );
  }
}

export async function submitProcurementQuotationsAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  if (!requestId) {
    redirectWithMessage("/procurement", "error", "Хүсэлтийн дугаар буруу байна.");
  }

  try {
    const quotations = await Promise.all(
      [1, 2, 3].map(async (index) => {
        const file = getFiles(formData, `quote_file_${index}`)[0];
        const attachmentIds =
          file
            ? await uploadFilesToRequest(requestId, [file], "request", connectionOverrides)
            : [];

        return {
          supplier_id: getNumber(formData, `supplier_id_${index}`),
          quotation_ref: getString(formData, `quotation_ref_${index}`) || undefined,
          quotation_date: getString(formData, `quotation_date_${index}`) || undefined,
          amount_total: getNumber(formData, `amount_total_${index}`),
          expected_delivery_date: getString(formData, `expected_delivery_date_${index}`) || undefined,
          payment_terms_text: getString(formData, `payment_terms_${index}`) || undefined,
          delivery_terms_text: getString(formData, `delivery_terms_${index}`) || undefined,
          notes: getString(formData, `quote_note_${index}`) || undefined,
          is_selected: getString(formData, "selected_quote_index") === String(index),
          attachment_ids: attachmentIds,
        };
      }),
    );

    await submitProcurementQuotations(
      requestId,
      {
        quotations,
      },
      connectionOverrides,
    );

    revalidateProcurementPaths(requestId);
    redirect(`/procurement/${requestId}?notice=${encodeURIComponent("Үнийн саналууд амжилттай хадгалагдлаа.")}`);
  } catch (error) {
    redirectWithMessage(
      `/procurement/${requestId}`,
      "error",
      error instanceof Error ? error.message : "Үнийн санал хадгалах үед алдаа гарлаа.",
    );
  }
}

export async function runProcurementWorkflowAction(formData: FormData) {
  const connectionOverrides = await getConnectionOverrides();
  const requestId = getNumber(formData, "request_id");
  const action = getString(formData, "workflow_action");
  const note = getString(formData, "note") || undefined;

  if (!requestId || !action) {
    redirectWithMessage("/procurement", "error", "Үйлдлийн мэдээлэл дутуу байна.");
  }

  try {
    if (action === "submit_for_quotation") {
      await submitProcurementForQuotation(requestId, connectionOverrides);
    } else if (action === "move_to_finance_review") {
      await moveProcurementToFinanceReview(requestId, connectionOverrides);
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
    } else if (action === "mark_contract_signed") {
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "contract_final",
        note,
      });
      await markProcurementContractSigned(requestId, { note }, connectionOverrides);
    } else if (action === "mark_paid") {
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "payment_proof",
        note,
      });
      await markProcurementPaid(
        requestId,
        {
          selected_quotation_id: getNumber(formData, "selected_quotation_id") || undefined,
          paid_amount: getNumber(formData, "paid_amount") || undefined,
          payment_reference: getString(formData, "payment_reference") || undefined,
          payment_date: getString(formData, "payment_date") || undefined,
          note,
        },
        connectionOverrides,
      );
    } else if (action === "mark_received") {
      const files = getFiles(formData, "document_files");
      await uploadFilesToRequest(requestId, files, "document", connectionOverrides, {
        document_type: "receipt_proof",
        note,
      });
      await markProcurementReceived(requestId, { note }, connectionOverrides);
    } else if (action === "mark_done") {
      await markProcurementDone(requestId, connectionOverrides);
    } else if (action === "cancel") {
      await cancelProcurementRequest(requestId, connectionOverrides);
    } else {
      redirectWithMessage(`/procurement/${requestId}`, "error", "Танигдаагүй үйлдэл байна.");
    }

    revalidateProcurementPaths(requestId);
    redirect(`/procurement/${requestId}?notice=${encodeURIComponent("Үйлдэл амжилттай хадгалагдлаа.")}`);
  } catch (error) {
    redirectWithMessage(
      `/procurement/${requestId}`,
      "error",
      error instanceof Error ? error.message : "Үйлдэл гүйцэтгэх үед алдаа гарлаа.",
    );
  }
}
