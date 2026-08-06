import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, FileText, PackagePlus, Trash2 } from "lucide-react";

import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import { ProcurementQuoteForm } from "@/app/procurement/_components/procurement-quote-form";
import { ProcurementAttachmentPreview } from "@/app/procurement/_components/procurement-attachment-preview";
import { ProcurementPaymentConfirmation } from "@/app/procurement/_components/procurement-payment-confirmation";
import {
  createProcurementSupplierAction,
  deleteProcurementPackageAction,
  runProcurementWorkflowAction,
  saveProcurementPackageAction,
} from "@/app/procurement/actions";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessProcurementModule, requireSession } from "@/lib/auth";
import {
  loadProcurementMe,
  loadProcurementMeta,
  loadProcurementRequestDetail,
  type ProcurementAction,
  type ProcurementCodeLabel,
  type ProcurementLine,
  type ProcurementMeta,
  type ProcurementPackage,
  type ProcurementRequestDetail,
} from "@/lib/procurement";

import styles from "../procurement.module.css";

type PageProps = {
  params: Promise<{ requestId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const STATE_LABELS: Record<string, string> = {
  draft: "Ноорог",
  submitted: "Хүсэлт илгээгдсэн",
  quote: "Үнийн санал бүртгэгдсэн",
  quote_collection: "Үнийн санал бүртгэгдсэн",
  finance_review: "Төлбөрийн хяналтанд",
  admin_review: "Хуулийн мэргэжилтэнд илгээсэн",
  ceo_decision: "Тушаал батлуулах шатанд",
  ceo_order_uploaded: "Тушаал гарсан",
  legal_contract_draft: "Хуулийн мэргэжилтэнд илгээсэн",
  contract_draft_started: "Гэрээний төсөл эхэлсэн",
  order_draft_started: "Тушаалын төсөл эхэлсэн",
  order_draft_uploaded: "Тушаалын төсөл гарсан",
  legal_final_contract: "Гэрээний төсөл батлагдсан",
  payment_pending: "Төлбөрийн хяналтанд",
  payment_recorded: "Төлбөр төлөгдсөн",
  receiving: "Хүлээн авалт хүлээгдэж байна",
  received: "Хүлээн авалт хүлээгдэж байна",
  done: "Дууссан",
  returned: "Буцаагдсан",
  cancelled: "Цуцлагдсан",
};

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatDate(value?: string | null) {
  if (!value) return "Товлоогүй";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("mn-MN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

function formatDateTime(value?: string | null) {
  if (!value) return "Бүртгэгдээгүй";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function findAction(actions: ProcurementAction[], code: string) {
  return actions.find((action) => action.code === code);
}

function formatStatePair(oldState?: ProcurementCodeLabel | null, newState?: ProcurementCodeLabel | null) {
  return `${oldState?.label || "Эхлэл"} -> ${newState?.label || "Тодорхойгүй"}`;
}

function emptyMeta(): ProcurementMeta {
  return { projects: [], tasks: [], vehicles: [], departments: [], storekeepers: [], suppliers: [], uoms: [] };
}

function statusClass(item: ProcurementRequestDetail) {
  if (item.is_delayed) return styles.badgeDanger;
  if (item.state.code === "quote_collection" || item.state.code === "quote" || item.state.code === "submitted") return styles.badgeWarning;
  if (item.state.code.includes("admin") || item.state.code.includes("ceo")) return styles.badgePurple;
  if (item.state.code.includes("payment") || item.state.code.includes("received")) return styles.badgeBlue;
  return styles.badge;
}

function getStatusLabel(item: ProcurementRequestDetail) {
  const packages = item.packages || [];
  const allReceived =
    item.receipt_status.code === "received" ||
    item.state.code === "done" ||
    Boolean(packages.length && packages.every((pack) => pack.receipt_status?.code === "received" || pack.route_state?.code === "done"));
  if (allReceived) return "Дууссан";
  const paidAwaitingReceipt =
    item.payment_status.code === "payment_recorded" ||
    item.state.code === "payment_recorded" ||
    item.state.code === "paid" ||
    packages.some((pack) => pack.payment_status?.code === "payment_recorded" || pack.route_state?.code === "payment_recorded");
  if (paidAwaitingReceipt) return "Хүлээн авалт";
  return STATE_LABELS[item.state.code] || item.state.label || "Илгээсэн";
}

function isDepartmentHeadSession(session: Awaited<ReturnType<typeof requireSession>>) {
  return session.role === "project_manager" || Boolean(session.groupFlags?.municipalDepartmentHead);
}

function isExecutiveProcurementUser(procurementUser: Awaited<ReturnType<typeof loadProcurementMe>>) {
  return procurementUser.flags.admin || procurementUser.flags.director || procurementUser.flags.general_manager;
}

function isProcurementWorkerUser(procurementUser: Awaited<ReturnType<typeof loadProcurementMe>>) {
  return Boolean(
    procurementUser.flags.storekeeper ||
      procurementUser.flags.finance ||
      procurementUser.flags.office_clerk ||
      procurementUser.flags.contract_officer,
  );
}

function normalizeName(value?: string | null) {
  return (value || "").trim().toLocaleLowerCase("mn-MN");
}

function packageRows(packages: ProcurementPackage[]) {
  return packages.reduce(
    (summary, item) => ({
      items: summary.items + item.lines.length,
      quantity: summary.quantity + item.total_quantity,
    }),
    { items: 0, quantity: 0 },
  );
}

function supplierInvoiceLinks(item: ProcurementRequestDetail) {
  const links = item.packages.flatMap((pack) =>
    pack.quotations.flatMap((quote) =>
      quote.attachments.map((attachment, attachmentIndex) => ({
        key: `${pack.id}-${quote.id}-${attachment.id}`,
        attachment,
        label:
          quote.attachments.length > 1
            ? `${quote.supplier.name} ${attachmentIndex + 1}`
            : quote.supplier.name,
      })),
    ),
  );

  for (const quote of item.quotations) {
    for (const [attachmentIndex, attachment] of quote.attachments.entries()) {
      if (links.some((link) => link.attachment.id === attachment.id)) {
        continue;
      }
      links.push({
        key: `request-${quote.id}-${attachment.id}`,
        attachment,
        label:
          quote.attachments.length > 1
            ? `${quote.supplier.name} ${attachmentIndex + 1}`
            : quote.supplier.name,
      });
    }
  }

  return links;
}

function isPackagePayable(pack: ProcurementPackage, item: ProcurementRequestDetail) {
  return (
    (pack.route_state?.code === "finance_review" ||
      pack.route_state?.code === "payment_pending" ||
      (pack.is_complete && !pack.is_over_threshold && item.state.code !== "draft" && item.state.code !== "submitted")) &&
    pack.payment_status?.code !== "payment_recorded"
  );
}

function processBadges(item: ProcurementRequestDetail, packages: ProcurementPackage[]) {
  const visiblePackages = packages.length ? packages : item.packages || [];
  const highValuePackages = visiblePackages.filter((pack) => pack.is_over_threshold);
  const orderApproved = highValuePackages.length
    ? highValuePackages.every((pack) => pack.ceo_order_ready)
    : Boolean(item.date_order_issued);
  const orderWaiting = highValuePackages.some((pack) =>
    ["order_draft_started", "order_draft_uploaded", "order_approval", "ceo_order_uploaded"].includes(pack.route_state?.code || ""),
  );
  const contractDone =
    item.legal_state?.code === "completed" ||
    item.state.code === "payment_pending" ||
    highValuePackages.some((pack) => pack.route_state?.code === "payment_pending");
  const contractDrafting = ["legal_contract_draft", "contract_draft_started", "order_draft_started", "order_draft_uploaded", "ceo_order_uploaded", "legal_final_contract"].includes(item.state.code);
  const paymentDone =
    item.payment_status.code === "payment_recorded" ||
    Boolean(visiblePackages.length && visiblePackages.every((pack) => pack.payment_status?.code === "payment_recorded"));
  const receiptDone =
    item.receipt_status.code === "received" ||
    item.state.code === "done" ||
    Boolean(visiblePackages.length && visiblePackages.every((pack) => pack.receipt_status?.code === "received" || pack.route_state?.code === "done"));

  return [
    {
      label: "Тушаал",
      value: orderApproved ? "Тушаал гарсан" : orderWaiting ? "Тушаалын төсөл / батлуулах шатанд" : "Хүлээгдэж байна",
      className: orderApproved ? styles.badge : orderWaiting ? styles.badgeWarning : styles.badgeOutline,
    },
    {
      label: "Гэрээ",
      value: contractDone ? "Гэрээний төсөл батлагдсан" : contractDrafting ? "Боловсруулж байна" : "Хүлээгдэж байна",
      className: contractDone ? styles.badge : contractDrafting ? styles.badgeWarning : styles.badgeOutline,
    },
    {
      label: "Төлбөр",
      value: paymentDone ? "Төлбөр төлөгдсөн" : item.payment_status.label,
      className: paymentDone ? styles.badge : styles.badgeOutline,
    },
    {
      label: "Хүлээн авалт",
      value: receiptDone ? "Дууссан" : "Хүлээн авалт хүлээгдэж байна",
      className: receiptDone ? styles.badge : styles.badgeOutline,
    },
  ];
}

export const dynamic = "force-dynamic";

export default async function ProcurementDetailPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  if (!canAccessProcurementModule(session)) {
    redirect("/");
  }

  const { requestId } = await params;
  const parsedRequestId = Number(requestId);
  if (!parsedRequestId) {
    redirect("/procurement");
  }

  const query = (await searchParams) || {};
  const notice = getValue(query.notice);
  const error = getValue(query.error);
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  const [procurementUser, item, meta, departmentScopeName] = await Promise.all([
    loadProcurementMe(connectionOverrides),
    loadProcurementRequestDetail(parsedRequestId, connectionOverrides),
    loadProcurementMeta(connectionOverrides).catch(() => emptyMeta()),
    loadSessionDepartmentName(session),
  ]);

  const submitForQuotationAction = findAction(item.available_actions, "submit_for_quotation");
  const submitQuotesAction = findAction(item.available_actions, "submit_quotations");
  const startContractDraftAction = findAction(item.available_actions, "start_contract_draft");
  const startOrderDraftAction = findAction(item.available_actions, "start_order_draft");
  const uploadOrderDraftAction = findAction(item.available_actions, "upload_order_draft");
  const prepareOrderAction = findAction(item.available_actions, "prepare_order");
  const recordPackageCeoOrderAction = findAction(item.available_actions, "record_package_ceo_order");
  const directorDecisionAction = findAction(item.available_actions, "director_decision");
  const attachFinalOrderAction = findAction(item.available_actions, "attach_final_order");
  const markContractAction = findAction(item.available_actions, "mark_contract_signed");
  const markPaidAction = findAction(item.available_actions, "mark_paid");
  const markReceivedAction = findAction(item.available_actions, "mark_received");
  const cancelAction = findAction(item.available_actions, "cancel");
  const visibleActions = item.available_actions.filter(
    (action) => action.code !== "move_to_finance_review" && !(item.state.code === "done" && action.code === "mark_done"),
  );
  const selectedQuotation = item.quotations.find((quotation) => quotation.is_selected);
  const packages = item.packages || [];
  const requestedPackageId = Number(getValue(query.package_id));
  const focusedPackage = Number.isFinite(requestedPackageId) && requestedPackageId > 0
    ? packages.find((pack) => pack.id === requestedPackageId)
    : undefined;
  const visiblePackages = focusedPackage ? [focusedPackage] : packages;
  const highValuePackages = visiblePackages.filter((pack) => pack.is_over_threshold);
  const lowValuePackages = visiblePackages.filter((pack) => !pack.is_over_threshold);
  const missingCeoOrderPackages = highValuePackages.filter((pack) => !pack.ceo_order_ready);
  const contractStartPackages = highValuePackages.filter((pack) => pack.route_state?.code === "legal_contract_draft");
  const orderStartPackages = highValuePackages.filter((pack) => pack.route_state?.code === "contract_draft_started");
  const orderDraftUploadPackages = highValuePackages.filter((pack) => pack.route_state?.code === "order_draft_started");
  const finalContractPackages = highValuePackages.filter((pack) =>
    ["ceo_order_uploaded", "legal_final_contract"].includes(pack.route_state?.code || ""),
  );
  const payablePackages = visiblePackages.filter((pack) => isPackagePayable(pack, item));
  const receivablePackages = visiblePackages.filter(
    (pack) => pack.payment_status?.code === "payment_recorded" && pack.receipt_status?.code !== "received",
  );
  const unassignedLines = item.unassigned_lines || item.lines.filter((line) => !line.package_id);
  const totals = packageRows(visiblePackages);
  const invoiceLinks = supplierInvoiceLinks(item);
  const invoiceAttachmentIds = new Set(invoiceLinks.map((invoice) => invoice.attachment.id));
  const visibleDocuments = item.documents.filter(
    (document) =>
      document.document_type.code !== "quote" &&
      (!document.attachments.length || document.attachments.some((attachment) => !invoiceAttachmentIds.has(attachment.id))),
  );
  const visibleAttachments = item.attachments.filter((attachment) => !invoiceAttachmentIds.has(attachment.id));
  const isDepartmentHeadView =
    isDepartmentHeadSession(session) &&
    !isExecutiveProcurementUser(procurementUser) &&
    !isProcurementWorkerUser(procurementUser);

  if (
    isDepartmentHeadView &&
    departmentScopeName &&
    normalizeName(item.department?.name) !== normalizeName(departmentScopeName)
  ) {
    redirect("/procurement");
  }

  const canManageWorkflow = !isDepartmentHeadView;
  const canManagePackages = canManageWorkflow && Boolean(submitQuotesAction || procurementUser.flags.storekeeper || procurementUser.flags.admin);
  const canRecordPackagePayment = canManageWorkflow && (procurementUser.flags.finance || procurementUser.flags.admin || Boolean(markPaidAction));
  const isHighValueFlow = focusedPackage ? focusedPackage.is_over_threshold : item.is_over_threshold;
  const statusBadges = processBadges(item, visiblePackages);
  const flowLabel = focusedPackage
    ? focusedPackage.is_over_threshold
      ? "Гэрээтэй процесс"
      : "Энгийн процесс"
    : item.flow_type?.label || (item.is_over_threshold ? "Гэрээтэй процесс" : "Урсгал тодорхойгүй");
  const timeline = [
    { label: "Хүсэлт", active: true, note: formatDate(item.required_date) },
    { label: "Багц үүсгэх", active: visiblePackages.length > 0, note: focusedPackage ? "Сонгосон багц" : `${packages.length} багц` },
    { label: "Бараа ангилах", active: item.lines.length > 0 && unassignedLines.length === 0, note: `${unassignedLines.length} үлдсэн` },
    { label: "Үнийн санал", active: visiblePackages.length > 0 && visiblePackages.every((pack) => pack.is_complete), note: focusedPackage ? focusedPackage.name : "Багц бүрээр" },
    { label: "Дараагийн шат", active: item.state.code !== "submitted" && item.state.code !== "quote" && item.state.code !== "quote_collection", note: getStatusLabel(item) },
  ];

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title={item.name}
      description={item.title}
      activeTab="list"
    >
      {notice ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{notice}</section> : null}
      {error ? <section className={`${styles.statusBanner} ${styles.errorBanner}`}>{error}</section> : null}

      <section className={styles.detailLayout}>
        <div className={styles.detailStack}>
          <section className={styles.detailHeader}>
            <div className={styles.detailHeaderTop}>
              <div>
                <div className={styles.badgeRow}>
                  <span className={statusClass(item)}>{getStatusLabel(item)}</span>
                  <span className={isHighValueFlow ? styles.badgeWarning : styles.badge}>{flowLabel}</span>
                  <span className={visiblePackages.every((pack) => pack.is_complete) && visiblePackages.length ? styles.badge : styles.badgeOutline}>
                    {visiblePackages.filter((pack) => pack.is_complete).length}/{visiblePackages.length} багц бэлэн
                  </span>
                  {visiblePackages.length ? <span className={styles.badgeOutline}>{lowValuePackages.length} энгийн багц</span> : null}
                  {visiblePackages.length ? <span className={styles.badgeWarning}>{highValuePackages.length} гэрээтэй багц</span> : null}
                  {statusBadges.map((badge) => (
                    <span key={badge.label} className={badge.className}>
                      {badge.label}: {badge.value}
                    </span>
                  ))}
                </div>
                <h2>{focusedPackage?.name || item.title}</h2>
                <p className={styles.subtleText}>
                  {focusedPackage ? focusedPackage.note || `${item.name} · ${item.title}` : item.description || "Тайлбар оруулаагүй байна."}
                </p>
              </div>
            </div>
            <div className={styles.flowTimeline}>
              {timeline.map((step) => (
                <div key={step.label} className={`${styles.timelineStep} ${step.active ? styles.timelineStepActive : ""}`}>
                  <span className={styles.timelineDot}>{step.active ? <CheckCircle2 aria-hidden /> : null}</span>
                  <strong>{step.label}</strong>
                  <small>{step.note}</small>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.cardSection} id="summary">
            <div className={`${styles.sectionHeader} ${styles.requestSummaryHeader}`}>
              <div>
                <h2>Хүсэлтийн мэдээлэл</h2>
                <p>Эх үүсвэр, хариуцсан нярав, төлөв болон дараагийн шатны мэдээлэл.</p>
              </div>
              <Link href="/procurement" className={styles.secondaryButton}>Буцах</Link>
            </div>
            <div className={styles.infoGrid}>
              <Info label="Хэлтэс" value={item.department?.name || "Сонгоогүй"} />
              <Info label="Хүсэлт гаргагч" value={item.requester?.name || "Тодорхойгүй"} />
              <Info label="Холбогдох объект" value={item.vehicle?.name || item.project?.name || item.task?.name || "Сонгоогүй"} />
              <Info label="Нярав" value={item.storekeeper?.name || "Сонгоогүй"} />
              <Info label="Төлбөр" value={focusedPackage?.payment_status?.label || item.payment_status.label} />
              <Info label="Хүлээн авалт" value={focusedPackage?.receipt_status?.label || item.receipt_status.label} />
            </div>
          </section>

          {canManagePackages ? (
            <section className={styles.cardSection} id="lines">
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Барааны мөрүүд</h2>
                  <p>Хэлтсийн даргын оруулсан барааг нярав багцуудад ангилна.</p>
                </div>
                <span className={unassignedLines.length ? styles.badgeWarning : styles.badge}>
                  {unassignedLines.length ? `${unassignedLines.length} бараа багцгүй` : "Бүгд багцад орсон"}
                </span>
              </div>
              <LineTable lines={item.lines} />
            </section>
          ) : null}

          {canManagePackages ? (
            <section className={styles.cardSection} id="package-create">
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Багц үүсгэх</h2>
                  <p>Багцын нэр өгөөд тухайн багцад орох бараануудыг сонгоно.</p>
                </div>
                <PackagePlus aria-hidden />
              </div>
              <form action={saveProcurementPackageAction} className={styles.packageForm}>
                <input type="hidden" name="request_id" value={item.id} />
                <div className={styles.formGrid}>
                  <label className={styles.fieldLabel}>
                    Багцын нэр
                    <input name="package_name" placeholder="Жишээ: Цахилгааны материал - багц 1" required />
                  </label>
                  <label className={styles.fieldLabel}>
                    Тайлбар
                    <input name="package_note" placeholder="Сонголттой" />
                  </label>
                </div>
                <SelectableLineList lines={unassignedLines} emptyText="Багцад ороогүй бараа алга." />
                <button type="submit" className={styles.primaryButton}>Багц хадгалах</button>
              </form>
            </section>
          ) : null}

          <section className={styles.cardSection} id="packages">
            <div className={styles.sectionHeader}>
              <div>
                <h2>Багцууд</h2>
                <p>{focusedPackage ? "Сонгосон багцын үнийн санал, төлбөрийн мэдээлэл." : "Багц бүрийн бараа болон нийлүүлэгчийн үнийн санал / нэхэмжлэх."}</p>
              </div>
              <span className={styles.badge}>{visiblePackages.length} багц</span>
            </div>
            {visiblePackages.length ? (
              <div className={styles.packageGrid}>
                {visiblePackages.map((pack) => (
                  <PackageCard
                    key={pack.id}
                    requestId={item.id}
                    pack={pack}
                    unassignedLines={unassignedLines}
                    suppliers={meta.suppliers}
                    canManage={canManagePackages}
                    canPay={canRecordPackagePayment && isPackagePayable(pack, item)}
                    quoteMode={procurementUser.flags.finance && !procurementUser.flags.admin && pack.is_over_threshold ? "selected" : "all"}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}><strong>Багц үүсгээгүй байна.</strong></div>
            )}
          </section>

          {!focusedPackage ? <section className={styles.cardSection} id="package-summary">
            <div className={styles.sectionHeader}>
              <div>
                <h2>Бүх багцууд - дүгнэлт</h2>
                <p>Багц бүрийн бараа болон үнийн санал / нэхэмжлэх бүртгэлийн төлөв.</p>
              </div>
            </div>
            <div className={styles.tableShell}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Багц</th>
                    <th>Бараа</th>
                    <th>Нийт тоо</th>
                    <th>Төлөв</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pack, index) => (
                    <tr key={pack.id}>
                      <td>{index + 1}</td>
                      <td>{pack.name}</td>
                      <td>{pack.lines.length}</td>
                      <td>{pack.total_quantity}</td>
                      <td><span className={pack.is_complete ? styles.badge : styles.badgeWarning}>{pack.is_complete ? "Дууссан" : "Дутуу"}</span></td>
                    </tr>
                  ))}
                  {!packages.length ? <tr><td colSpan={5}>Багцын мэдээлэл алга.</td></tr> : null}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Нийт</td>
                    <td>{totals.items}</td>
                    <td>{totals.quantity}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section> : null}

          <section className={styles.cardSection} id="documents">
            <div className={styles.sectionHeader}><div><h2>Баримт бичиг</h2><p>Invoice, төлбөр, гэрээ болон хүлээн авалтын хавсралтууд.</p></div></div>
            {visibleDocuments.length || visibleAttachments.length ? (
              <div className={styles.documentList}>
                {visibleDocuments.map((document) => (
                  <article key={document.id} className={styles.documentCard}>
                    <div className={styles.documentHeader}>
                      <strong>{document.document_type.label}</strong>
                      {document.is_required ? <span className={styles.badgeWarning}>Шаардлагатай</span> : null}
                    </div>
                    <p className={styles.subtleText}>{document.note || "Тайлбаргүй"}</p>
                    {document.attachments.some((attachment) => !invoiceAttachmentIds.has(attachment.id)) ? (
                      <div className={styles.documentLinkGrid}>
                        {document.attachments.filter((attachment) => !invoiceAttachmentIds.has(attachment.id)).map((attachment) => (
                          <ProcurementAttachmentPreview
                            key={attachment.id}
                            attachment={attachment}
                            title={document.document_type.label}
                            note={document.note}
                          />
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
                <div className={styles.documentLinkGrid}>
                  {visibleAttachments.map((attachment) => (
                    <ProcurementAttachmentPreview
                      key={attachment.id}
                      attachment={attachment}
                      title={attachment.name}
                      note={attachment.mimetype || "Файл"}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.emptyState}><strong>Баримт бичиг хавсаргаагүй байна.</strong></div>
            )}
          </section>

          <section className={styles.cardSection}>
            <div className={styles.sectionHeader}><div><h2>Түүх</h2><p>Урсгалын өөрчлөлтийн бүртгэл.</p></div></div>
            {item.audit.length ? (
              <div className={styles.tableList}>
                {item.audit.map((audit) => (
                  <div key={audit.id} className={styles.documentCard}>
                    <div className={styles.tableRowHeader}>
                      <strong>{audit.action_label}</strong>
                      <span className={styles.badgeOutline}>{formatDateTime(audit.changed_at)}</span>
                    </div>
                    <p className={styles.subtleText}>{formatStatePair(audit.old_state, audit.new_state)} - {audit.user.name}</p>
                    {audit.note ? <p className={styles.subtleText}>{audit.note}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}><strong>Түүхийн бүртгэл алга.</strong></div>
            )}
          </section>
        </div>

        <aside className={styles.sideStack} id="actions">
          <section className={styles.sidePanel}>
            <h3>Дараагийн үйлдэл</h3>
            {visibleActions.length ? (
              <div className={styles.badgeRow}>
                {visibleActions.map((action) => (
                  <span key={action.code} className={styles.badgeOutline}>{action.label}</span>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}><strong>Шууд хийх үйлдэл алга.</strong></div>
            )}
          </section>

          {canManagePackages ? (
            <form action={createProcurementSupplierAction} className={styles.actionCard}>
              <input type="hidden" name="request_id" value={item.id} />
              <h3>Шинэ нийлүүлэгч нэмэх</h3>
              <label className={styles.fieldLabel}>Нэр<input name="supplier_name" required /></label>
              <label className={styles.fieldLabel}>Регистр<input name="supplier_vat" /></label>
              <label className={styles.fieldLabel}>Утас<input name="supplier_phone" /></label>
              <label className={styles.fieldLabel}>И-мэйл<input name="supplier_email" /></label>
              <label className={styles.fieldLabel}>Хаяг<input name="supplier_street" /></label>
              <button type="submit" className={styles.secondaryButton}>Нийлүүлэгч нэмэх</button>
            </form>
          ) : null}

          {submitForQuotationAction && canManageWorkflow ? (
            <WorkflowButton requestId={item.id} action="submit_for_quotation" label="Худалдан авах хүсэлт үүсгэх" />
          ) : null}
          {prepareOrderAction && canManageWorkflow && !highValuePackages.length ? (
            <WorkflowButton requestId={item.id} action="prepare_order" label="Тушаалын төсөл хүлээн авах" />
          ) : null}
          {recordPackageCeoOrderAction && canManageWorkflow && highValuePackages.length ? (
            <section className={styles.actionCard}>
              <h3>Архив бичиг хэргийн ажилтан</h3>
              <p className={styles.subtleText}>
                {missingCeoOrderPackages.length
                  ? `${missingCeoOrderPackages.length} багцын батлагдсан тушаал upload хүлээгдэж байна.`
                  : "Бүх гэрээтэй багцын тушаал батлагдсан байна."}
              </p>
              {missingCeoOrderPackages.map((pack) => (
                <PackageCeoOrderForm key={pack.id} requestId={item.id} pack={pack} />
              ))}
            </section>
          ) : null}
          {directorDecisionAction && canManageWorkflow && !recordPackageCeoOrderAction ? (
            <form action={runProcurementWorkflowAction} className={styles.actionCard}>
              <input type="hidden" name="request_id" value={item.id} />
              <input type="hidden" name="workflow_action" value="director_decision" />
              <label className={styles.fieldLabel}>
                Сонгох нийлүүлэгч
                <select name="selected_quotation_id" defaultValue={selectedQuotation?.id || ""}>
                  {item.quotations.map((quotation) => (
                    <option key={quotation.id} value={quotation.id}>{quotation.supplier.name}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className={styles.primaryButton}>Баталсан тушаал оруулах</button>
            </form>
          ) : null}
          {attachFinalOrderAction && canManageWorkflow && !recordPackageCeoOrderAction ? (
            <DocumentActionForm
              requestId={item.id}
              action="attach_final_order"
              label="Баталсан тушаал оруулах"
              fileLabel="Баталсан тушаал"
              accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
            />
          ) : null}
          {(startContractDraftAction || startOrderDraftAction || uploadOrderDraftAction || markContractAction) && canManageWorkflow ? (
            <section className={styles.actionCard}>
              <h3>Хуулийн мэргэжилтэн</h3>
              {startContractDraftAction && contractStartPackages.map((pack) => (
                <WorkflowButton
                  key={`contract-start-${pack.id}`}
                  requestId={item.id}
                  action="start_contract_draft"
                  packageId={pack.id}
                  label={`${pack.name} - Гэрээний төсөл эхлүүлэх`}
                />
              ))}
              {startContractDraftAction && !packages.length ? (
                <WorkflowButton
                  requestId={item.id}
                  action="start_contract_draft"
                  label="Гэрээний төсөл эхлүүлэх"
                />
              ) : null}
              {startOrderDraftAction && orderStartPackages.map((pack) => (
                <WorkflowButton
                  key={`order-start-${pack.id}`}
                  requestId={item.id}
                  action="start_order_draft"
                  packageId={pack.id}
                  label={`${pack.name} - Тушаалын төсөл эхлүүлэх`}
                />
              ))}
              {startOrderDraftAction && !packages.length ? (
                <WorkflowButton
                  requestId={item.id}
                  action="start_order_draft"
                  label="Тушаалын төсөл эхлүүлэх"
                />
              ) : null}
              {uploadOrderDraftAction && orderDraftUploadPackages.map((pack) => (
                <DocumentActionForm
                  key={`order-upload-${pack.id}`}
                  requestId={item.id}
                  action="upload_order_draft"
                  label={`${pack.name} - Тушаалын төсөл оруулах`}
                  packageId={pack.id}
                  fileLabel="Тушаалын төсөл docx/pdf"
                  accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                />
              ))}
              {uploadOrderDraftAction && !packages.length ? (
                <DocumentActionForm
                  requestId={item.id}
                  action="upload_order_draft"
                  label="Тушаалын төсөл оруулах"
                  fileLabel="Тушаалын төсөл docx/pdf"
                  accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                />
              ) : null}
              {markContractAction && finalContractPackages.map((pack) => (
                <DocumentActionForm
                  key={`contract-final-${pack.id}`}
                  requestId={item.id}
                  action="mark_contract_signed"
                  label={`${pack.name} - Гэрээ оруулах`}
                  packageId={pack.id}
                  fileLabel="Гэрээний файл"
                  accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                />
              ))}
              {markContractAction && !packages.length ? (
                <DocumentActionForm requestId={item.id} action="mark_contract_signed" label="Гэрээ оруулах" fileLabel="Гэрээний файл" />
              ) : null}
            </section>
          ) : null}
          {canRecordPackagePayment && visiblePackages.length && payablePackages.length ? (
            <section className={styles.actionCard}>
              <h3>Ерөнхий ня-бо</h3>
              <p className={styles.subtleText}>Бичиг баримтын бүрдлийг шалгаад төлбөр төлөгдсөнийг баталгаажуулна.</p>
              <a href="#packages" className={styles.secondaryButton}>Багц руу очих</a>
            </section>
          ) : null}
          {markPaidAction && canManageWorkflow && procurementUser.flags.finance && item.payment_status.code !== "payment_recorded" && !packages.length ? (
            <RequestPaymentForm requestId={item.id} item={item} selectedQuotation={selectedQuotation} />
          ) : null}
          {(markReceivedAction || item.payment_status.code === "payment_recorded" || receivablePackages.length) && canManageWorkflow && procurementUser.flags.storekeeper ? (
            visiblePackages.length ? (
              <section className={styles.actionCard}>
                <h3>Нярав</h3>
                {receivablePackages.length ? (
                  receivablePackages.map((pack) => (
                    <DocumentActionForm
                      key={pack.id}
                      requestId={item.id}
                      action="mark_received"
                      label={`${pack.name} - Хүлээн авалтыг баталгаажуулах`}
                      packageId={pack.id}
                      fileLabel="Хүлээн авалтын баримт"
                    />
                  ))
                ) : (
                  <div className={styles.emptyState}><strong>Хүлээн авахад бэлэн багц алга.</strong></div>
                )}
              </section>
            ) : (
              <DocumentActionForm requestId={item.id} action="mark_received" label="Хүлээн авалтыг баталгаажуулах" fileLabel="Хүлээн авалтын баримт" />
            )
          ) : null}
          {cancelAction && canManageWorkflow ? (
            <form action={runProcurementWorkflowAction} className={styles.actionCard}>
              <input type="hidden" name="request_id" value={item.id} />
              <input type="hidden" name="workflow_action" value="cancel" />
              <button type="submit" className={styles.dangerButton}>Буцаах / цуцлах</button>
            </form>
          ) : null}

          <nav className={styles.stickyActionBar} aria-label="Хурдан шилжих">
            <a href="#summary" className={styles.stickyActionLink}>Мэдээлэл</a>
            {canManagePackages ? <a href="#lines" className={styles.stickyActionLink}>Бараа</a> : null}
            <a href="#packages" className={styles.stickyActionLink}>Багц</a>
            {!focusedPackage ? <a href="#package-summary" className={styles.stickyActionLink}>Дүгнэлт</a> : null}
          </nav>
        </aside>
      </section>
    </ProcurementShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className={styles.infoCard}><span>{label}</span><strong>{value}</strong></div>;
}

function LineTable({ lines }: { lines: ProcurementLine[] }) {
  return (
    <div className={styles.tableShell}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>#</th>
            <th>Нэр</th>
            <th>Тодорхойлолт</th>
            <th>Тоо</th>
            <th>Багц</th>
          </tr>
        </thead>
        <tbody>
          {lines.length ? lines.map((line, index) => (
            <tr key={line.id}>
              <td>{index + 1}</td>
              <td>{line.product_name || "Нэргүй мөр"}</td>
              <td>{line.specification || "-"}</td>
              <td>{line.quantity} {line.uom?.name || ""}</td>
              <td>{line.package_id ? "Багцад орсон" : "Багцгүй"}</td>
            </tr>
          )) : <tr><td colSpan={5}>Хүсэлтийн мөр бүртгэгдээгүй байна.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SelectableLineList({ lines, emptyText }: { lines: ProcurementLine[]; emptyText: string }) {
  if (!lines.length) {
    return <div className={styles.emptyState}><strong>{emptyText}</strong></div>;
  }

  return (
    <div className={styles.selectableList}>
      {lines.map((line) => (
        <label key={line.id} className={styles.selectableItem}>
          <input type="checkbox" name="line_ids" value={line.id} defaultChecked={Boolean(line.package_id)} />
          <span>
            <strong>{line.product_name || "Нэргүй мөр"}</strong>
            <small>{line.quantity} {line.uom?.name || ""} · {line.specification || "Тодорхойлолтгүй"}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

function PackageCard({
  requestId,
  pack,
  unassignedLines,
  suppliers,
  canManage,
  canPay,
  quoteMode,
}: {
  requestId: number;
  pack: ProcurementPackage;
  unassignedLines: ProcurementLine[];
  suppliers: ProcurementMeta["suppliers"];
  canManage: boolean;
  canPay: boolean;
  quoteMode: "all" | "selected";
}) {
  const editableLines = [...pack.lines, ...unassignedLines];
  const selectedQuoteId = pack.ceo_selected_quotation?.id || pack.lowest_quotation?.id || 0;
  const visibleQuotes = quoteMode === "selected" ? pack.quotations.filter((quote) => quote.id === selectedQuoteId) : pack.quotations;
  return (
    <article className={`${styles.packageCard} ${pack.is_complete ? styles.packageCardDone : ""}`}>
      <div className={styles.packageHeader}>
        <div>
          <span className={pack.is_complete ? styles.badge : styles.badgeWarning}>{pack.is_complete ? "Дууссан" : "Дутуу"}</span>
          <h3>{pack.name}</h3>
          {pack.note ? <p className={styles.subtleText}>{pack.note}</p> : null}
        </div>
      </div>

      <div className={styles.packageMetaGrid}>
        <Info label="Сонгосон бараа" value={`${pack.lines.length}`} />
        <Info label="Нийт тоо" value={`${pack.total_quantity}`} />
        <Info label="Үнийн санал" value={`${pack.quote_count}`} />
      </div>

      {canManage ? (
        <details className={styles.inlineDetails}>
          <summary>Багц засах</summary>
          <form action={saveProcurementPackageAction} className={styles.packageForm}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="package_id" value={pack.id} />
            <label className={styles.fieldLabel}>Багцын нэр<input name="package_name" defaultValue={pack.name} required /></label>
            <label className={styles.fieldLabel}>Тайлбар<input name="package_note" defaultValue={pack.note || ""} /></label>
            <SelectableLineList lines={editableLines} emptyText="Сонгох бараа алга." />
            <div className={styles.buttonRow}>
              <button type="submit" className={styles.secondaryButton}>Засвар хадгалах</button>
            </div>
          </form>
          <form action={deleteProcurementPackageAction}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="package_id" value={pack.id} />
            <button type="submit" className={styles.dangerButton}><Trash2 aria-hidden /> Багц устгах</button>
          </form>
        </details>
      ) : null}

      {!canPay ? (
        <div className={styles.quoteList}>
          {visibleQuotes.map((quote) => (
            <div key={quote.id} className={`${styles.quoteMiniCard} ${quote.is_selected ? styles.quoteMiniCardSelected : ""}`}>
              <strong>{quote.supplier.name}</strong>
              {quote.attachments.length ? (
                <span className={styles.invoicePreviewList}>
                  {quote.attachments.map((attachment, index) => (
                    <ProcurementAttachmentPreview
                      key={attachment.id}
                      attachment={attachment}
                      title={`Нэхэмжлэх${quote.attachments.length > 1 ? ` ${index + 1}` : ""}`}
                      note={quote.supplier.name}
                    />
                  ))}
                </span>
              ) : (
                <small>Нэхэмжлэх байхгүй</small>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {canPay ? <PackagePaymentForm requestId={requestId} pack={pack} /> : null}

      {canManage ? (
        <details className={styles.inlineDetails} open={!pack.is_complete}>
          <summary>Үнийн санал бүртгэх</summary>
          <ProcurementQuoteForm
            requestId={requestId}
            packageId={pack.id}
            packageName={pack.name}
            editableLines={!pack.is_complete ? editableLines : []}
            suppliers={suppliers}
            quotations={pack.quotations}
          />
        </details>
      ) : null}
    </article>
  );
}

function PackageCeoOrderForm({ requestId, pack }: { requestId: number; pack: ProcurementPackage }) {
  const defaultQuotationId = pack.ceo_selected_quotation_id || pack.lowest_quotation?.id || pack.quotations[0]?.id || "";
  const selectedSupplierName =
    pack.ceo_selected_quotation?.supplier.name ||
    pack.lowest_quotation?.supplier.name ||
    pack.quotations[0]?.supplier.name ||
    "Нийлүүлэгч тодорхойгүй";

  return (
    <form action={runProcurementWorkflowAction} className={styles.inlineForm}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="workflow_action" value="record_package_ceo_order" />
      <input type="hidden" name="package_id" value={pack.id} />
      {defaultQuotationId ? <input type="hidden" name="selected_quotation_id" value={defaultQuotationId} /> : null}
      <div className={styles.tableRowHeader}>
        <div>
          <strong>{pack.name}</strong>
          <p className={styles.subtleText}>{pack.lines.length} бараа</p>
        </div>
        <span className={pack.ceo_order_ready ? styles.badge : styles.badgeWarning}>
          {pack.ceo_order_ready ? "Тушаал батлагдсан" : "Тушаал батлуулах шатанд"}
        </span>
      </div>
      <p className={styles.subtleText}>Нийлүүлэгч: {selectedSupplierName}. Дахин сонгох шаардлагагүй.</p>
      {pack.order_draft_attachments?.length ? (
        <div className={styles.inlineDetails}>
          <h4>Хуулийн мэргэжилтнээс ирсэн тушаалын төсөл</h4>
          <ul className={styles.attachmentList}>
            {pack.order_draft_attachments.map((attachment) => (
              <li key={attachment.id}><FileText aria-hidden /> {attachment.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className={styles.fieldLabel}>Тушаалын дугаар<input name="order_number" defaultValue={pack.ceo_order_number || ""} /></label>
      <label className={styles.fieldLabel}>Тушаалын огноо<input type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} name="order_date" defaultValue={pack.ceo_order_date || ""} required /></label>
      <label className={styles.fieldLabel}>Товч утга<textarea name="note" defaultValue={pack.ceo_order_note || pack.ceo_decision_note || ""} /></label>
      <label className={styles.fieldLabel}>Баталсан тушаал<input type="file" name="document_files" multiple required={!pack.ceo_order_attachments?.length} /></label>
      {pack.ceo_order_attachments?.length ? (
        <ul className={styles.attachmentList}>
          {pack.ceo_order_attachments.map((attachment) => (
            <li key={attachment.id}><FileText aria-hidden /> {attachment.name}</li>
          ))}
        </ul>
      ) : null}
      <button type="submit" className={styles.primaryButton}>Тушаал батлагдлаа гэж тэмдэглэх</button>
    </form>
  );
}

function RequestPaymentForm({
  requestId,
  item,
  selectedQuotation,
}: {
  requestId: number;
  item: ProcurementRequestDetail;
  selectedQuotation?: ProcurementRequestDetail["quotations"][number];
}) {
  const quote = selectedQuotation || item.quotations[0];
  return (
    <section className={styles.actionCard}>
      <h3>Ерөнхий ня-бо</h3>
      <DocumentChecklist />
      <ProcurementPaymentConfirmation
        requestId={requestId}
        selectedQuotationId={quote?.id}
        supplierName={quote?.supplier.name || item.selected_supplier?.name || "Нийлүүлэгч тодорхойгүй"}
        amount={item.paid_amount || item.selected_supplier_total || item.amount_approx_total || 0}
        bankAccount={quote?.bank_account_text}
        paymentReference={item.payment_reference}
        paymentDate={item.payment_date}
        note={item.payment_note}
      />
    </section>
  );
}

function PackagePaymentForm({ requestId, pack }: { requestId: number; pack: ProcurementPackage }) {
  const selectedQuote = pack.ceo_selected_quotation || pack.lowest_quotation;
  const routeLabel = pack.is_over_threshold ? "Гэрээтэй процесс" : "Энгийн процесс";
  const paymentQuotes = pack.is_over_threshold ? (selectedQuote ? [selectedQuote] : []) : pack.quotations;
  const defaultQuotationId = selectedQuote?.id || pack.lowest_quotation?.id || pack.quotations[0]?.id || "";

  if (!pack.is_over_threshold) {
    return (
      <form action={runProcurementWorkflowAction} className={styles.inlineForm}>
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="workflow_action" value="mark_paid" />
        <input type="hidden" name="package_id" value={pack.id} />
        <div className={styles.tableRowHeader}>
          <div>
            <strong>{pack.name}</strong>
            <p className={styles.subtleText}>{routeLabel} · Нэхэмжлэх сонгоно</p>
          </div>
          <span className={styles.badge}>{routeLabel}</span>
        </div>
        {paymentQuotes.length ? (
          <div className={styles.quoteList}>
            {paymentQuotes.map((quote) => (
              <label key={quote.id} className={`${styles.quoteMiniCard} ${quote.id === defaultQuotationId ? styles.quoteMiniCardSelected : ""}`}>
                <input type="radio" name="selected_quotation_id" value={quote.id} defaultChecked={quote.id === defaultQuotationId} />
                <strong>{quote.supplier.name}</strong>
              </label>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}><strong>Төлөх нэхэмжлэх олдсонгүй.</strong></div>
        )}
        <input type="hidden" name="paid_amount" value={Math.max(1, Math.round(pack.paid_amount || pack.amount_total || 0))} />
        <label className={styles.fieldLabel}>Гүйлгээний дугаар<input name="payment_reference" defaultValue={pack.payment_reference || ""} /></label>
        <label className={styles.fieldLabel}>Төлсөн огноо<input type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} name="payment_date" defaultValue={pack.payment_date || ""} /></label>
        <label className={styles.fieldLabel}>Тайлбар<textarea name="note" defaultValue={pack.payment_note || ""} /></label>
        <label className={styles.fieldLabel}>Баримт<input type="file" name="document_files" multiple /></label>
        <button type="submit" className={styles.primaryButton}>Төлбөр төлөгдсөнийг баталгаажуулах</button>
      </form>
    );
  }

  return (
    <div className={styles.inlineForm}>
      <div className={styles.tableRowHeader}>
        <div>
          <strong>{pack.name}</strong>
          <p className={styles.subtleText}>
            {routeLabel} · {pack.is_over_threshold ? "Захирлын сонгосон нэхэмжлэх" : "Нэхэмжлэх сонгоно"}
          </p>
        </div>
        <span className={pack.is_over_threshold ? styles.badgeWarning : styles.badge}>{routeLabel}</span>
      </div>
      {paymentQuotes.length ? (
        <div className={styles.quoteList}>
          {paymentQuotes.map((quote) => (
            <label key={quote.id} className={`${styles.quoteMiniCard} ${quote.id === defaultQuotationId ? styles.quoteMiniCardSelected : ""}`}>
              {!pack.is_over_threshold ? (
                <input type="radio" name="selected_quotation_id" value={quote.id} defaultChecked={quote.id === defaultQuotationId} />
              ) : null}
              <strong>{quote.supplier.name}</strong>
              {quote.attachments.length ? (
                <span className={styles.invoicePreviewList}>
                  {quote.attachments.map((attachment, index) => (
                    <ProcurementAttachmentPreview
                      key={attachment.id}
                      attachment={attachment}
                      title={`Нэхэмжлэх${quote.attachments.length > 1 ? ` ${index + 1}` : ""}`}
                      note={quote.supplier.name}
                    />
                  ))}
                </span>
              ) : (
                <small>Нэхэмжлэх байхгүй</small>
              )}
            </label>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}><strong>Төлөх нэхэмжлэх олдсонгүй.</strong></div>
      )}
      <DocumentChecklist />
      <ProcurementPaymentConfirmation
        requestId={requestId}
        packageId={pack.id}
        selectedQuotationId={Number(defaultQuotationId) || undefined}
        supplierName={selectedQuote?.supplier.name || pack.lowest_quotation?.supplier.name || "Нийлүүлэгч тодорхойгүй"}
        amount={pack.paid_amount || pack.amount_total || selectedQuote?.amount_total || 0}
        bankAccount={selectedQuote?.bank_account_text}
        paymentReference={pack.payment_reference}
        paymentDate={pack.payment_date}
        note={pack.payment_note}
      />
    </div>
  );
}

function DocumentChecklist() {
  return (
    <ul className={styles.attachmentList}>
      <li>Худалдан авах хүсэлт</li>
      <li>Үнийн санал / нэхэмжлэх</li>
      <li>Батлагдсан тушаал</li>
      <li>Эцсийн гэрээ</li>
    </ul>
  );
}

function WorkflowButton({ requestId, action, label, packageId }: { requestId: number; action: string; label: string; packageId?: number }) {
  return (
    <form action={runProcurementWorkflowAction} className={packageId ? styles.inlineForm : styles.actionCard}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="workflow_action" value={action} />
      {packageId ? <input type="hidden" name="package_id" value={packageId} /> : null}
      <button type="submit" className={styles.primaryButton}>{label}</button>
    </form>
  );
}

function DocumentActionForm({
  requestId,
  action,
  label,
  packageId,
  fileLabel = "Файл",
  accept,
}: {
  requestId: number;
  action: string;
  label: string;
  packageId?: number;
  fileLabel?: string;
  accept?: string;
}) {
  const isReceivedAction = action === "mark_received";
  return (
    <form action={runProcurementWorkflowAction} className={packageId ? styles.inlineForm : styles.actionCard}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="workflow_action" value={action} />
      {packageId ? <input type="hidden" name="package_id" value={packageId} /> : null}
      {isReceivedAction ? (
        <>
          <label className={styles.fieldLabel}>Тайлбар<textarea name="note" defaultValue="Хүлээн авалтыг баталгаажуулав." /></label>
          <label className={styles.fieldLabel}>{fileLabel}<input type="file" name="document_files" multiple accept={accept} /></label>
        </>
      ) : (
        <>
          <label className={styles.fieldLabel}>Тайлбар<textarea name="note" /></label>
          <label className={styles.fieldLabel}>{fileLabel}<input type="file" name="document_files" multiple accept={accept} required={!isReceivedAction} /></label>
        </>
      )}
      <button type="submit" className={styles.primaryButton}>{label}</button>
    </form>
  );
}
