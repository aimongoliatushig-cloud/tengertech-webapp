"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  PlayCircle,
  Search,
  SlidersHorizontal,
  Truck,
  X,
} from "lucide-react";

import { ProcurementQuoteForm } from "@/app/procurement/_components/procurement-quote-form";
import { ProcurementAttachmentPreview } from "@/app/procurement/_components/procurement-attachment-preview";
import { runProcurementWorkflowAction } from "@/app/procurement/actions";
import type {
  ProcurementAction,
  ProcurementMeta,
  ProcurementPackage,
  ProcurementRequestDetail,
  ProcurementUser,
} from "@/lib/procurement";

import styles from "../procurement.module.css";

type DashboardFilter =
  | "all"
  | "active"
  | "done"
  | "low"
  | "high"
  | "project"
  | "vehicle";

type ModalState = {
  requestId: number;
  action: ProcurementAction;
} | null;

type ProcurementDetailResponse = {
  ok?: boolean;
  item?: ProcurementRequestDetail;
  error?: string;
};

const DASHBOARD_PAGE_SIZE = 10;

const STATE_LABELS: Record<string, string> = {
  draft: "Ноорог",
  submitted: "Хүсэлт илгээгдсэн",
  quote: "Үнийн санал бүртгэгдсэн",
  quote_collection: "Үнийн санал бүртгэгдсэн",
  quotation_waiting: "Үнийн санал бүртгэгдсэн",
  quotations_ready: "Хуулийн мэргэжилтэнд илгээсэн",
  finance_review: "Төлбөрийн хяналтанд",
  admin_review: "Хуулийн мэргэжилтэнд илгээсэн",
  ceo_decision: "Тушаал батлуулах шатанд",
  ceo_order_uploaded: "Тушаал гарсан",
  legal_contract_draft: "Хуулийн мэргэжилтэнд илгээсэн",
  contract_draft_started: "Гэрээний төсөл эхэлсэн",
  order_draft_started: "Тушаалын төсөл эхэлсэн",
  order_draft_uploaded: "Тушаалын төсөл гарсан",
  legal_final_contract: "Гэрээний төсөл батлагдсан",
  contract_review: "Гэрээний төсөл эхэлсэн",
  payment_pending: "Төлбөрийн хяналтанд",
  payment: "Төлбөрийн хяналтанд",
  payment_waiting: "Төлбөрийн хяналтанд",
  payment_recorded: "Төлбөр төлөгдсөн",
  paid: "Хүлээн авалт",
  received: "Хүлээн авалт",
  done: "Дууссан",
  returned: "Буцаасан",
  rejected: "Татгалзсан",
  cancelled: "Цуцлагдсан",
};

const ACTION_LABELS: Record<string, string> = {
  submit_for_quotation: "Худалдан авах хүсэлт үүсгэх",
  submit_quotations: "Үнийн санал бүртгэх",
  move_to_finance_review: "Дараагийн шат руу илгээх",
  start_contract_draft: "Гэрээний төсөл эхлүүлэх",
  start_order_draft: "Тушаалын төсөл эхлүүлэх",
  upload_order_draft: "Тушаалын төсөл оруулах",
  prepare_order: "Тушаалын төсөл хүлээн авах",
  director_decision: "Тушаал бүртгэх",
  record_package_ceo_order: "Батлагдсан тушаал хавсаргах",
  attach_final_order: "Тушаал батлагдлаа гэж тэмдэглэх",
  mark_contract_signed: "Гэрээ оруулах",
  mark_paid: "Төлбөр төлөгдсөнийг баталгаажуулах",
  mark_received: "Хүлээн авалтыг баталгаажуулах",
  cancel: "Буцаах / цуцлах",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function getStatusLabel(item: ProcurementRequestDetail) {
  const code = getDerivedStageCode(item);
  return STATE_LABELS[code] || item.state.label || "Илгээсэн";
}

function getCalculatedTotal(item: ProcurementRequestDetail) {
  const directLines = item.lines.reduce(
    (sum, line) => sum + (line.approx_subtotal || line.quantity * line.approx_unit_price),
    0,
  );
  if (directLines > 0) return directLines;
  return item.packages.reduce(
    (sum, pack) =>
      sum +
      pack.lines.reduce(
        (lineSum, line) => lineSum + (line.approx_subtotal || line.quantity * line.approx_unit_price),
        0,
      ),
    0,
  );
}

function getRealTotal(item: ProcurementRequestDetail) {
  if (item.selected_supplier_total > 0) return item.selected_supplier_total;
  const packageQuoteTotal = item.packages.reduce((sum, pack) => {
    const quote = pack.ceo_selected_quotation || pack.lowest_quotation || pack.quotations.find((entry) => entry.is_selected);
    return sum + (quote?.amount_total || pack.amount_total || 0);
  }, 0);
  if (packageQuoteTotal > 0) return packageQuoteTotal;
  const selectedQuote = item.quotations.find((quotation) => quotation.is_selected);
  if (selectedQuote?.amount_total) return selectedQuote.amount_total;
  return 0;
}

function getDisplayTotal(item: ProcurementRequestDetail) {
  return getRealTotal(item) || getCalculatedTotal(item) || item.amount_approx_total || 0;
}

function getPaymentQuotationId(item: ProcurementRequestDetail) {
  const packageQuote = item.packages
    .map((pack) => pack.ceo_selected_quotation || pack.quotations.find((quote) => quote.is_selected) || pack.lowest_quotation)
    .find(Boolean);
  return item.selected_quotation_id || packageQuote?.id || item.quotations.find((quote) => quote.is_selected)?.id || undefined;
}

function getThreshold(item: ProcurementRequestDetail) {
  return item.is_over_threshold || getDisplayTotal(item) > 1000000 ? "high" : "low";
}

function hasHighValueFlow(item: ProcurementRequestDetail) {
  return getThreshold(item) === "high" || item.packages.some((pack) => pack.is_over_threshold);
}

function getRelationType(item: ProcurementRequestDetail) {
  return item.vehicle || item.procurement_type.code === "repair_part" ? "vehicle" : "project";
}

function getRelationLabel(item: ProcurementRequestDetail) {
  if (getRelationType(item) === "vehicle") return item.vehicle?.name || "Тээврийн хэрэгсэл";
  return item.task?.name || item.project?.name || "Төсөл";
}

function hasReceivedAllPackages(item: ProcurementRequestDetail) {
  if (item.receipt_status.code === "received" || item.state.code === "done") return true;
  return Boolean(item.packages.length && item.packages.every((pack) => pack.receipt_status?.code === "received" || pack.route_state?.code === "done"));
}

function hasPaidAwaitingReceipt(item: ProcurementRequestDetail) {
  if (hasReceivedAllPackages(item)) return false;
  if (item.payment_status.code === "payment_recorded" || item.state.code === "payment_recorded" || item.state.code === "paid") {
    return true;
  }
  return item.packages.some((pack) => pack.payment_status?.code === "payment_recorded" || pack.route_state?.code === "payment_recorded");
}

function getDerivedStageCode(item: ProcurementRequestDetail) {
  if (hasReceivedAllPackages(item)) return "done";
  if (hasPaidAwaitingReceipt(item)) return "payment_recorded";
  return item.state.code;
}

function getPackageStageCode(pack: ProcurementPackage) {
  if (pack.receipt_status?.code === "received" || pack.route_state?.code === "done") return "done";
  if (pack.payment_status?.code === "payment_recorded" || pack.route_state?.code === "payment_recorded") return "payment_recorded";
  return pack.route_state?.code || "";
}

function stageIndexFromCode(code: string, highValue: boolean) {
  const paymentIndex = highValue ? 7 : 3;
  const paidIndex = highValue ? 8 : 4;
  const receiveIndex = highValue ? 9 : 4;
  const doneIndex = highValue ? 10 : 5;
  if (code === "done") return doneIndex;
  if (code === "received") return receiveIndex;
  if (code === "paid" || code === "payment_recorded") return paidIndex;
  if (code === "payment_pending" || code === "payment" || code === "payment_waiting") return paymentIndex;
  if (highValue && code === "legal_final_contract") return 6;
  if (highValue && code === "ceo_order_uploaded") return 5;
  if (highValue && code === "order_draft_uploaded") return 4;
  if (highValue && code === "order_draft_started") return 3;
  if (highValue && code === "contract_draft_started") return 2;
  if (highValue && code === "legal_contract_draft") return 1;
  if (code.includes("order")) return highValue ? 4 : 3;
  if (
    code.includes("director") ||
    code.includes("admin") ||
    code.includes("ceo") ||
    code === "quotations_ready"
  ) {
    return 3;
  }
  if (code.includes("finance_review")) return highValue ? paymentIndex : 3;
  return 0;
}

function getCurrentStageIndex(item: ProcurementRequestDetail) {
  const highValue = hasHighValueFlow(item);
  const code = getDerivedStageCode(item);
  const packageIndexes = item.packages
    .map((pack) => stageIndexFromCode(getPackageStageCode(pack), highValue))
    .filter((index) => index > 0);
  const stateIndex = stageIndexFromCode(code, highValue);
  if (stateIndex > 0 || packageIndexes.length) {
    return Math.max(stateIndex, ...packageIndexes);
  }
  if (item.selected_supplier || item.selected_quotation_id) return 2;
  if (code.includes("quote") || code.includes("quotation") || code === "submitted") return 1;
  return 0;
}

function firstDate(...values: Array<string | null | undefined>) {
  return values.find(Boolean) || null;
}

function firstPackageDate(
  item: ProcurementRequestDetail,
  getter: (pack: ProcurementPackage) => string | null | undefined,
) {
  return firstDate(...item.packages.map(getter));
}

function getStageDate(item: ProcurementRequestDetail, index: number, highValue: boolean) {
  if (index === 0) return item.required_date;
  if (index === 1) return item.date_quotation_submitted;
  if (highValue && index >= 2 && index <= 4) return firstPackageDate(item, (pack) => pack.ceo_decision_date);
  if (highValue && index === 5) {
    return firstDate(
      item.date_director_decision,
      item.date_order_issued,
      firstPackageDate(item, (pack) => pack.ceo_decision_date),
      firstPackageDate(item, (pack) => pack.ceo_order_date),
    );
  }
  if (highValue && (index === 6 || index === 7)) return item.date_contract_signed;
  if (index === (highValue ? 8 : 3)) {
    return firstDate(item.date_paid, item.payment_date, firstPackageDate(item, (pack) => pack.date_paid || pack.payment_date));
  }
  return firstDate(item.date_received, firstPackageDate(item, (pack) => pack.date_received || pack.received_date));
}

function getWorkflowStages(item: ProcurementRequestDetail) {
  const highValue = hasHighValueFlow(item);
  const currentIndex = getCurrentStageIndex(item);
  const labels = highValue
    ? [
        "Хүсэлт",
        "Үнийн санал",
        "Гэрээний төсөл эхэлсэн",
        "Тушаалын төсөл эхэлсэн",
        "Тушаалын төсөл гарсан",
        "Тушаал гарсан",
        "Гэрээний төсөл батлагдсан",
        "Төлбөрийн хяналтанд",
        "Төлбөр төлөгдсөн",
        "Хүлээн авалт",
        "Дууссан",
      ]
    : [
        "Хүсэлт",
        "Үнийн санал",
        "Төлбөрийн хяналтанд",
        "Төлбөр төлөгдсөн",
        "Хүлээн авалт",
        "Дууссан",
      ];
  return labels.map((label, index) => ({
    label,
    date: formatDate(getStageDate(item, index, highValue)),
    state:
      item.state.code === "done" || index < currentIndex
        ? "done"
        : index === currentIndex
          ? "current"
          : "upcoming",
  }));
}

function flattenQuotations(item: ProcurementRequestDetail) {
  const packageQuotes = item.packages.flatMap((pack) =>
    pack.quotations.map((quote) => ({ ...quote, packageName: pack.name })),
  );
  const requestQuotes = item.quotations.map((quote) => ({ ...quote, packageName: "Хүсэлт" }));
  const seen = new Set<number>();
  return [...packageQuotes, ...requestQuotes].filter((quote) => {
    if (seen.has(quote.id)) return false;
    seen.add(quote.id);
    return true;
  });
}

function invoiceAttachmentIds(item: ProcurementRequestDetail) {
  return new Set(
    flattenQuotations(item).flatMap((quote) => quote.attachments.map((attachment) => attachment.id)),
  );
}

function visibleDocumentLinks(item: ProcurementRequestDetail) {
  const invoiceIds = invoiceAttachmentIds(item);
  const packageOrderLinks = item.packages.flatMap((pack) =>
    (pack.ceo_order_attachments || [])
      .filter((attachment) => !invoiceIds.has(attachment.id))
      .map((attachment) => ({
        key: `package-order-${pack.id}-${attachment.id}`,
        title: "ГЗ тушаал",
        note: pack.name,
        attachment,
      })),
  );
  const documentLinks = item.documents.flatMap((document) =>
    document.attachments
      .filter((attachment) => !invoiceIds.has(attachment.id))
      .map((attachment) => ({
        key: `document-${document.id}-${attachment.id}`,
        title: document.document_type.label || "Баримт бичиг",
        note: document.note || "",
        attachment,
      })),
  );
  const attachmentLinks = item.attachments
    .filter((attachment) => !invoiceIds.has(attachment.id))
    .map((attachment) => ({
      key: `attachment-${attachment.id}`,
      title: "Хавсралт",
      note: "",
      attachment,
    }));
  const seen = new Set<number>();
  return [...packageOrderLinks, ...documentLinks, ...attachmentLinks].filter((entry) => {
    if (seen.has(entry.attachment.id)) return false;
    seen.add(entry.attachment.id);
    return true;
  });
}

function isReceivablePackage(pack: ProcurementPackage) {
  return pack.payment_status?.code === "payment_recorded" && pack.receipt_status?.code !== "received";
}

function isReceivableRequest(item: ProcurementRequestDetail) {
  if (item.state.code === "done" || item.receipt_status.code === "received") return false;
  if (item.payment_status.code === "payment_recorded") return true;
  return item.packages.some(isReceivablePackage);
}

function isPaidRequest(item: ProcurementRequestDetail) {
  if (item.payment_status.code === "payment_recorded" || item.state.code === "paid" || item.state.code === "payment_recorded") {
    return true;
  }
  return Boolean(item.packages.length && item.packages.every((pack) => pack.payment_status?.code === "payment_recorded"));
}

function isPaymentActionAvailable(item: ProcurementRequestDetail) {
  if (isPaidRequest(item) || item.state.code === "done") return false;
  if (item.packages.length) return item.packages.some((pack) => isPackagePayable(pack, item));
  return item.payment_status.code !== "payment_recorded";
}

function getUnassignedProcurementLines(item: ProcurementRequestDetail) {
  const packagedLineIds = new Set(item.packages.flatMap((pack) => pack.lines.map((line) => line.id)));
  if (item.unassigned_lines?.length) {
    return item.unassigned_lines.filter((line) => !packagedLineIds.has(line.id));
  }
  return item.lines.filter((line) => !line.package_id && !packagedLineIds.has(line.id));
}

function hasInvoiceEntryTarget(item: ProcurementRequestDetail) {
  if (getUnassignedProcurementLines(item).length > 0) return true;
  return item.packages.some((pack) => pack.lines.length > 0 && !pack.is_complete);
}

function isRoleAllowedAction(action: ProcurementAction, userFlags: ProcurementUser["flags"]) {
  if (userFlags.admin) return true;
  if (action.code === "mark_paid") return userFlags.finance;
  if (action.code === "mark_received") return userFlags.storekeeper;
  if (["start_contract_draft", "start_order_draft", "upload_order_draft", "mark_contract_signed"].includes(action.code)) {
    return userFlags.contract_officer;
  }
  if (["record_package_ceo_order", "attach_final_order", "director_decision", "prepare_order"].includes(action.code)) {
    return userFlags.office_clerk;
  }
  if (["submit_for_quotation", "submit_quotations", "move_to_finance_review"].includes(action.code)) {
    return userFlags.storekeeper;
  }
  return false;
}

function isStateAllowedAction(action: ProcurementAction, item: ProcurementRequestDetail) {
  if (action.code === "submit_quotations") return hasInvoiceEntryTarget(item);
  if (action.code === "mark_paid") return isPaymentActionAvailable(item);
  if (action.code === "mark_received") return isReceivableRequest(item);
  return true;
}

function getDashboardActions(
  item: ProcurementRequestDetail,
  userFlags: ProcurementUser["flags"],
  hideActions: boolean,
) {
  if (hideActions) return [];
  const actions = item.available_actions
    .filter((action) => action.code !== "mark_done" && action.code !== "move_to_finance_review")
    .filter((action) => isRoleAllowedAction(action, userFlags))
    .filter((action) => isStateAllowedAction(action, item));
  if (
    userFlags.storekeeper &&
    isReceivableRequest(item) &&
    !actions.some((action) => action.code === "mark_received")
  ) {
    actions.push({ code: "mark_received", label: "Хүлээлгэн өгсөн" });
  }
  return actions;
}

function isPackagePayable(pack: ProcurementPackage, item: ProcurementRequestDetail) {
  return (
    (pack.route_state?.code === "finance_review" ||
      pack.route_state?.code === "payment_pending" ||
      (pack.is_complete && !pack.is_over_threshold && item.state.code !== "draft" && item.state.code !== "submitted")) &&
    pack.payment_status?.code !== "payment_recorded"
  );
}

function statAmount(items: ProcurementRequestDetail[]) {
  return `${items.length} хүсэлт`;
}

function filterItems(items: ProcurementRequestDetail[], filter: DashboardFilter) {
  if (filter === "active") return items.filter((item) => item.state.code !== "done");
  if (filter === "done") return items.filter((item) => item.state.code === "done");
  if (filter === "low") return items.filter((item) => getThreshold(item) === "low");
  if (filter === "high") return items.filter((item) => getThreshold(item) === "high");
  if (filter === "project") return items.filter((item) => getRelationType(item) === "project");
  if (filter === "vehicle") return items.filter((item) => getRelationType(item) === "vehicle");
  return items;
}

function timestamp(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortNewestFirst(items: ProcurementRequestDetail[]) {
  return [...items].sort((left, right) => {
    const rightTime = timestamp(right.create_date) || timestamp(right.write_date) || timestamp(right.required_date);
    const leftTime = timestamp(left.create_date) || timestamp(left.write_date) || timestamp(left.required_date);
    return rightTime - leftTime || right.id - left.id;
  });
}

function dateKey(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function getSubmittedDateKey(item: ProcurementRequestDetail) {
  return dateKey(item.create_date) || dateKey(item.required_date);
}

function itemMatchesSearch(item: ProcurementRequestDetail, rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase("mn-MN");
  if (!query) return true;
  return `${item.name} ${item.title}`.toLocaleLowerCase("mn-MN").includes(query);
}

function itemMatchesDateRange(item: ProcurementRequestDetail, startDate: string, endDate: string) {
  if (!startDate && !endDate) return true;
  const itemDate = getSubmittedDateKey(item);
  if (!itemDate) return false;
  const from = startDate && endDate && startDate > endDate ? endDate : startDate;
  const to = startDate && endDate && startDate > endDate ? startDate : endDate;
  if (from && itemDate < from) return false;
  if (to && itemDate > to) return false;
  return true;
}

function StageRail({ item }: { item: ProcurementRequestDetail }) {
  return (
    <div className={styles.stageRail}>
      {getWorkflowStages(item).map((stage) => (
        <span
          key={stage.label}
          className={`${styles.stageArrow} ${
            stage.state === "done"
              ? styles.stageArrowDone
              : stage.state === "current"
                ? styles.stageArrowCurrent
                : styles.stageArrowUpcoming
          }`}
        >
          <span className={styles.stageCheck}>{stage.state === "upcoming" ? "" : "✓"}</span>
          <strong>{stage.label}</strong>
          <small>{stage.date}</small>
        </span>
      ))}
    </div>
  );
}

export function ProcurementDashboardClient({
  items,
  suppliers,
  returnPath,
  userFlags,
  hideActions,
}: {
  items: ProcurementRequestDetail[];
  suppliers: ProcurementMeta["suppliers"];
  returnPath: string;
  userFlags: ProcurementUser["flags"];
  hideActions: boolean;
}) {
  const [filter, setFilter] = useState<DashboardFilter>("active");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [detailById, setDetailById] = useState<Record<number, ProcurementRequestDetail>>({});
  const [loadingDetailIds, setLoadingDetailIds] = useState<Record<number, boolean>>({});
  const [detailErrorById, setDetailErrorById] = useState<Record<number, string>>({});
  const baseSortedItems = useMemo(() => sortNewestFirst(items), [items]);
  const sortedItems = useMemo(
    () => baseSortedItems.map((item) => detailById[item.id] || item),
    [baseSortedItems, detailById],
  );
  const activeItems = useMemo(() => sortedItems.filter((item) => item.state.code !== "done"), [sortedItems]);
  const doneItems = useMemo(() => sortedItems.filter((item) => item.state.code === "done"), [sortedItems]);
  const filteredItems = useMemo(() => filterItems(sortedItems, filter), [filter, sortedItems]);
  const visibleItems = useMemo(
    () =>
      filteredItems.filter(
        (item) => itemMatchesSearch(item, searchQuery) && itemMatchesDateRange(item, dateFrom, dateTo),
      ),
    [dateFrom, dateTo, filteredItems, searchQuery],
  );
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / DASHBOARD_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => visibleItems.slice((currentPage - 1) * DASHBOARD_PAGE_SIZE, currentPage * DASHBOARD_PAGE_SIZE),
    [currentPage, visibleItems],
  );
  const lowItems = useMemo(() => sortedItems.filter((item) => getThreshold(item) === "low"), [sortedItems]);
  const highItems = useMemo(() => sortedItems.filter((item) => getThreshold(item) === "high"), [sortedItems]);
  const projectItems = useMemo(() => sortedItems.filter((item) => getRelationType(item) === "project"), [sortedItems]);
  const vehicleItems = useMemo(() => sortedItems.filter((item) => getRelationType(item) === "vehicle"), [sortedItems]);
  const modalItem = modal ? sortedItems.find((item) => item.id === modal.requestId) : undefined;
  const modalActionAllowed = modalItem && modal
    ? getDashboardActions(modalItem, userFlags, hideActions).some((action) => action.code === modal.action.code)
    : false;

  function resetDashboardPaging() {
    setPage(1);
    setExpandedId(null);
  }

  async function ensureRequestDetail(requestId: number) {
    if (detailById[requestId] || loadingDetailIds[requestId]) return;

    setLoadingDetailIds((current) => ({ ...current, [requestId]: true }));
    setDetailErrorById((current) => {
      const next = { ...current };
      delete next[requestId];
      return next;
    });

    try {
      const response = await fetch(`/api/procurement/requests/${requestId}`, {
        headers: { accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as ProcurementDetailResponse | null;
      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Дэлгэрэнгүй мэдээлэл дуудагдсангүй.");
      }
      setDetailById((current) => ({ ...current, [requestId]: payload.item! }));
    } catch (error) {
      setDetailErrorById((current) => ({
        ...current,
        [requestId]: error instanceof Error ? error.message : "Дэлгэрэнгүй мэдээлэл дуудагдсангүй.",
      }));
    } finally {
      setLoadingDetailIds((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
    }
  }

  function openDashboardItem(item: ProcurementRequestDetail) {
    const nextExpandedId = expandedId === item.id ? null : item.id;
    setExpandedId(nextExpandedId);
    if (nextExpandedId !== null) {
      void ensureRequestDetail(item.id);
    }
  }

  function openActionModal(item: ProcurementRequestDetail, action: ProcurementAction) {
    setModal({ requestId: item.id, action });
    void ensureRequestDetail(item.id);
  }

  const stats = [
    { key: "all" as const, label: "Нийт хүсэлт", value: sortedItems.length, helper: "Бүгд харагдана", icon: ClipboardList, items: sortedItems },
    { key: "active" as const, label: "Идэвхтэй", value: activeItems.length, helper: "Явагдаж буй", icon: PlayCircle, items: activeItems },
    { key: "done" as const, label: "Дууссан", value: doneItems.length, helper: "Дууссан", icon: CheckCircle2, items: doneItems },
    { key: "low" as const, label: "Энгийн багц", value: lowItems.length, helper: statAmount(lowItems), icon: Banknote, items: lowItems },
    { key: "high" as const, label: "Гэрээтэй багц", value: highItems.length, helper: statAmount(highItems), icon: FileText, items: highItems },
    { key: "project" as const, label: "Төсөлтэй холбоотой", value: projectItems.length, helper: statAmount(projectItems), icon: Building2, items: projectItems },
    { key: "vehicle" as const, label: "Тээврийн хэрэгсэлтэй", value: vehicleItems.length, helper: statAmount(vehicleItems), icon: Truck, items: vehicleItems },
  ];
  const title = stats.find((stat) => stat.key === filter)?.label || "Идэвхтэй";

  return (
    <>
      <section className={styles.dashboardCommandBar}>
        <div className={styles.dashboardSearch}>
          <Search aria-hidden />
          <input
            type="search"
            placeholder="Хайх..."
            aria-label="Худалдан авалтын хүсэлтийн нэрээр хайх"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              resetDashboardPaging();
            }}
          />
        </div>
        <button
          className={`${styles.filterIconButton} ${showDateFilter || dateFrom || dateTo ? styles.filterIconButtonActive : ""}`}
          type="button"
          aria-label="Огнооны шүүлтүүр"
          aria-expanded={showDateFilter}
          onClick={() => setShowDateFilter((current) => !current)}
        >
          <SlidersHorizontal aria-hidden />
        </button>
      </section>

      {showDateFilter ? (
        <section className={styles.dateFilterPanel} aria-label="Илгээсэн огнооны шүүлтүүр">
          <label>
            Эхлэх огноо
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                resetDashboardPaging();
              }}
            />
          </label>
          <label>
            Дуусах огноо
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                resetDashboardPaging();
              }}
            />
          </label>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              resetDashboardPaging();
            }}
          >
            Цэвэрлэх
          </button>
        </section>
      ) : null}

      <section className={styles.dashboardKpiGrid} aria-label="Худалдан авалтын KPI">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.key}
              type="button"
              className={`${styles.dashboardKpiCard} ${filter === stat.key ? styles.dashboardKpiCardActive : ""}`}
              onClick={() => {
                setFilter(stat.key);
                resetDashboardPaging();
              }}
            >
              <span className={`${styles.metricIcon} ${stat.key === "high" ? styles.metricWarning : styles.metricSuccess}`}>
                <Icon aria-hidden />
              </span>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.helper}</small>
            </button>
          );
        })}
      </section>

      <div className={styles.dashboardFilterTabs} aria-label="Худалдан авалтын төрөл">
        {[
          ["active", "Идэвхтэй"],
          ["done", "Дууссан"],
          ["low", "Энгийн"],
          ["high", "Гэрээтэй"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${styles.dashboardFilterTab} ${filter === key ? styles.dashboardFilterTabActive : ""}`}
            onClick={() => {
              setFilter(key as DashboardFilter);
              resetDashboardPaging();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <section className={styles.procurementBoard}>
        <div className={styles.dashboardSectionHeader}>
          <div>
            <h2>{title} худалдан авалт ({visibleItems.length})</h2>
            <p>Хайлт, огноо, хуудаслалт нь хуудас дахин ачаалалгүйгээр самбарыг шинэчилнэ.</p>
          </div>
        </div>
        <div className={styles.dashboardPanelList}>
          {pageItems.length ? (
            pageItems.map((item) => (
              <ProgressiveProcurementCard
                key={item.id}
                item={item}
                userFlags={userFlags}
                hideActions={hideActions}
                expanded={expandedId === item.id}
                loadingDetails={Boolean(loadingDetailIds[item.id])}
                detailError={detailErrorById[item.id]}
                onToggle={() => openDashboardItem(item)}
                onAction={(action) => openActionModal(item, action)}
              />
            ))
          ) : (
            <div className={styles.emptyState}>
              <strong>Энэ шүүлтүүрт тохирох худалдан авалт алга.</strong>
            </div>
          )}
        </div>
        {visibleItems.length > DASHBOARD_PAGE_SIZE ? (
          <div className={styles.dashboardPagination} aria-label="Худалдан авалтын хуудаслалт">
            <span>
              {(currentPage - 1) * DASHBOARD_PAGE_SIZE + 1}-{Math.min(currentPage * DASHBOARD_PAGE_SIZE, visibleItems.length)} / {visibleItems.length}
            </span>
            <div>
              <button
                type="button"
                className={styles.pagerButton}
                disabled={currentPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Өмнөх
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`${styles.pagerButton} ${pageNumber === currentPage ? styles.pagerButtonActive : ""}`}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                className={styles.pagerButton}
                disabled={currentPage >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Дараах
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {modal && modalItem && loadingDetailIds[modal.requestId] && !detailById[modal.requestId] ? (
        <DetailLoadingModal item={modalItem} onClose={() => setModal(null)} />
      ) : modal && modalItem && modalActionAllowed ? (
        <ActionModal
          item={modalItem}
          action={modal.action}
          suppliers={suppliers}
          returnPath={returnPath}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

export function ProcurementActionRequiredList({
  items,
  suppliers,
  returnPath,
  userFlags,
  title = "Үйлдэл шаардсан худалдан авалт",
}: {
  items: ProcurementRequestDetail[];
  suppliers: ProcurementMeta["suppliers"];
  returnPath: string;
  userFlags: ProcurementUser["flags"];
  title?: string;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const actionItems = useMemo(
    () => sortNewestFirst(items).filter((item) => getDashboardActions(item, userFlags, false).length > 0),
    [items, userFlags],
  );
  const modalItem = modal ? actionItems.find((item) => item.id === modal.requestId) : undefined;
  const modalActionAllowed = modalItem && modal
    ? getDashboardActions(modalItem, userFlags, false).some((action) => action.code === modal.action.code)
    : false;

  return (
    <section className={styles.procurementBoard}>
      <div className={styles.dashboardSectionHeader}>
        <div>
          <h2>{title} ({actionItems.length})</h2>
          <p>Танд хийх шаардлагатай худалдан авалтын хүсэлтүүдийг суман явцаар харуулна.</p>
        </div>
      </div>
      <div className={styles.dashboardPanelList}>
        {actionItems.length ? (
          actionItems.map((item) => (
            <ProgressiveProcurementCard
              key={item.id}
              item={item}
              userFlags={userFlags}
              hideActions={false}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}
              onAction={(action) => setModal({ requestId: item.id, action })}
            />
          ))
        ) : (
          <div className={styles.emptyState}>
            <strong>Одоогоор хийх шаардлагатай худалдан авалт алга.</strong>
          </div>
        )}
      </div>

      {modal && modalItem && modalActionAllowed ? (
        <ActionModal
          item={modalItem}
          action={modal.action}
          suppliers={suppliers}
          returnPath={returnPath}
          onClose={() => setModal(null)}
        />
      ) : null}
    </section>
  );
}

function ProgressiveProcurementCard({
  item,
  userFlags,
  hideActions,
  expanded,
  loadingDetails = false,
  detailError = "",
  onToggle,
  onAction,
}: {
  item: ProcurementRequestDetail;
  userFlags: ProcurementUser["flags"];
  hideActions: boolean;
  expanded: boolean;
  loadingDetails?: boolean;
  detailError?: string;
  onToggle: () => void;
  onAction: (action: ProcurementAction) => void;
}) {
  const actions = getDashboardActions(item, userFlags, hideActions);
  return (
    <article className={`${styles.progressiveCard} ${expanded ? styles.progressiveCardOpen : ""}`}>
      <button type="button" className={styles.progressiveButton} onClick={onToggle} aria-expanded={expanded}>
        <div className={styles.progressiveHeader}>
          <div>
            <div className={styles.badgeRow}>
              <span className={styles.dashboardEyebrow}>{getStatusLabel(item)}</span>
              <span className={getRelationType(item) === "vehicle" ? styles.badgeBlue : styles.badge}>
                {getRelationType(item) === "vehicle" ? "Машин" : "Төсөл"}
              </span>
              <span className={getThreshold(item) === "high" ? styles.badgeWarning : styles.badge}>
                {getThreshold(item) === "high" ? "Гэрээтэй" : "Энгийн"}
              </span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.title}</p>
          </div>
          <div className={styles.mobileAmount}>
            <strong>{getStatusLabel(item)}</strong>
            <ChevronDown aria-hidden />
          </div>
        </div>
        <div className={styles.progressiveMetaRow}>
          <span>{getRelationLabel(item)}</span>
          <span>{item.current_responsible?.name || item.storekeeper?.name || item.requester?.name || "Хариуцагч тодорхойгүй"}</span>
        </div>
        <StageRail item={item} />
      </button>
      {actions.length ? (
        <div className={styles.progressActionRow} aria-label="Энэ худалдан авалт дээр хийх үйлдэл">
          {actions.map((action) => (
            <button key={action.code} type="button" className={styles.actionButton} onClick={() => onAction(action)}>
              {ACTION_LABELS[action.code] || action.label}
            </button>
          ))}
        </div>
      ) : null}
      {expanded ? (
        <AccordionDetails
          item={item}
          userFlags={userFlags}
          hideActions={hideActions}
          loadingDetails={loadingDetails}
          detailError={detailError}
          onAction={onAction}
        />
      ) : null}
    </article>
  );
}

function AccordionDetails({
  item,
  userFlags,
  hideActions,
  loadingDetails,
  detailError,
  onAction,
}: {
  item: ProcurementRequestDetail;
  userFlags: ProcurementUser["flags"];
  hideActions: boolean;
  loadingDetails: boolean;
  detailError: string;
  onAction: (action: ProcurementAction) => void;
}) {
  const quotations = flattenQuotations(item);
  const documentLinks = visibleDocumentLinks(item);
  const actions = getDashboardActions(item, userFlags, hideActions);
  return (
    <div className={styles.progressPanelContent}>
      {loadingDetails ? (
        <div className={`${styles.statusBanner} ${styles.noticeBanner}`}>
          Дэлгэрэнгүй мэдээлэл ачаалж байна...
        </div>
      ) : null}
      {detailError ? (
        <div className={`${styles.statusBanner} ${styles.errorBanner}`}>
          {detailError}
        </div>
      ) : null}
      <div className={styles.amountSummary}>
        <Info label="Барааны мөр" value={`${item.lines.length || item.packages.reduce((sum, pack) => sum + pack.lines.length, 0)} мөр`} />
        <Info label="Нэхэмжлэх" value={`${quotations.length} бүртгэл`} />
        <Info label="Холбогдох төрөл" value={getRelationType(item) === "vehicle" ? "Тээврийн хэрэгсэл" : "Төсөл"} />
        <Info label="Холбогдох объект" value={getRelationLabel(item)} />
      </div>
      <section>
        <h4>Хүсэлтийн бараа</h4>
        <div className={styles.productTable}>
          {item.lines.length ? (
            item.lines.map((line) => (
              <div key={line.id}>
                <strong>{line.product_name || "Нэргүй бараа"}</strong>
                <span>{line.specification || "-"}</span>
                <span>{line.quantity} {line.uom?.name || ""}</span>
              </div>
            ))
          ) : (
            <p className={styles.subtleText}>Барааны мөр алга.</p>
          )}
        </div>
      </section>
      <section>
        <h4>Багц ба нийлүүлэгчийн нэхэмжлэх</h4>
        <div className={styles.supplierInvoiceGrid}>
          {quotations.length ? (
            quotations.map((quote) => (
              <article key={quote.id} className={`${styles.quoteMiniCard} ${quote.is_selected ? styles.quoteMiniCardSelected : ""}`}>
                <strong>{quote.supplier.name}</strong>
                <small>{quote.packageName}</small>
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
                ) : null}
              </article>
            ))
          ) : (
            <p className={styles.subtleText}>Нийлүүлэгчийн нэхэмжлэх ороогүй байна.</p>
          )}
        </div>
      </section>
      <section>
        <h4>Гэрээ, хууль, хавсралт</h4>
        {documentLinks.length ? (
          <div className={styles.documentLinkGrid}>
            {documentLinks.map((document) => (
              <ProcurementAttachmentPreview
                key={document.key}
                attachment={document.attachment}
                title={document.title}
                note={document.note}
              />
            ))}
          </div>
        ) : (
          <p className={styles.subtleText}>Гэрээ болон хууль хянах хавсралт ороогүй байна.</p>
        )}
      </section>
      <section>
        <h4>Холбоотой мэдээлэл</h4>
        <div className={styles.relationGrid}>
          <Info label="Төсөл" value={item.project?.name || "-"} />
          <Info label="Даалгавар" value={item.task?.name || "-"} />
          <Info label="Машин" value={item.vehicle?.name || "-"} />
          <Info label="Хэлтэс" value={item.department?.name || "-"} />
        </div>
      </section>
      <section className={styles.actionPanel}>
        <h4>Дараагийн үйлдэл</h4>
        {actions.length ? (
          <div className={styles.buttonRow}>
            {actions.map((action) => (
              <button key={action.code} type="button" className={styles.actionButton} onClick={() => onAction(action)}>
                {ACTION_LABELS[action.code] || action.label}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.subtleText}>Шууд хийх үйлдэл алга.</p>
        )}
      </section>
    </div>
  );
}

function DetailLoadingModal({
  item,
  onClose,
}: {
  item: ProcurementRequestDetail;
  onClose: () => void;
}) {
  return (
    <div className={styles.actionModalOverlay} role="presentation">
      <div className={styles.actionModal} role="dialog" aria-modal="true" aria-labelledby="procurement-detail-loading-title">
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.dashboardEyebrow}>{item.name}</span>
            <h3 id="procurement-detail-loading-title">Дэлгэрэнгүй мэдээлэл ачаалж байна...</h3>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Хаах">
            <X aria-hidden />
          </button>
        </div>
        <p className={styles.subtleText}>Энэ хүсэлтийн бараа, багц, нэхэмжлэхийн мэдээллийг татаж байна.</p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActionModal({
  item,
  action,
  suppliers,
  returnPath,
  onClose,
}: {
  item: ProcurementRequestDetail;
  action: ProcurementAction;
  suppliers: ProcurementMeta["suppliers"];
  returnPath: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.actionModalOverlay} role="presentation">
      <div className={styles.actionModal} role="dialog" aria-modal="true" aria-labelledby="procurement-action-title">
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.dashboardEyebrow}>{item.name}</span>
            <h3 id="procurement-action-title">{ACTION_LABELS[action.code] || action.label}</h3>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Хаах">
            <X aria-hidden />
          </button>
        </div>
        <ActionForm item={item} action={action} suppliers={suppliers} returnPath={returnPath} onClose={onClose} />
      </div>
    </div>
  );
}

function ActionForm({
  item,
  action,
  suppliers,
  returnPath,
  onClose,
}: {
  item: ProcurementRequestDetail;
  action: ProcurementAction;
  suppliers: ProcurementMeta["suppliers"];
  returnPath: string;
  onClose: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (action.code === "submit_quotations") {
    const targetPackages = item.packages.filter((pack) => !pack.is_complete && pack.lines.length > 0);
    const unassignedLines = getUnassignedProcurementLines(item);
    const canCreatePackage = unassignedLines.length > 0;
    if (canCreatePackage) {
      return (
        <div className={styles.formStack}>
          <section className={styles.inlineDetails}>
            <h4>Шинэ багц үүсгээд нэхэмжлэх оруулах</h4>
            <p className={styles.subtleText}>
              Нэг нэхэмжлэх дээр орох бараануудыг сонгоно. Хэрэв бараа үлдвэл дараа нь дахин багц үүсгэнэ.
            </p>
            <ProcurementQuoteForm
              requestId={item.id}
              suppliers={suppliers}
              quotations={item.quotations}
              lines={unassignedLines}
              redirectPath={returnPath}
            />
          </section>
        </div>
      );
    }
    return targetPackages.length ? (
      <div className={styles.formStack}>
        {targetPackages.map((pack) => (
          <section key={pack.id} className={styles.inlineDetails}>
            <h4>{pack.name}</h4>
            <ProcurementQuoteForm
              requestId={item.id}
              packageId={pack.id}
              packageName={pack.name}
              editableLines={pack.lines}
              suppliers={suppliers}
              quotations={pack.quotations}
              redirectPath={returnPath}
            />
          </section>
        ))}
      </div>
    ) : (
      <p className={styles.subtleText}>Нэхэмжлэх оруулах багц олдсонгүй.</p>
    );
  }

  if (action.code === "director_decision") {
    const quotes = flattenQuotations(item);
    return (
      <form action={runProcurementWorkflowAction} className={styles.formStack}>
        <WorkflowHidden item={item} action={action.code} returnPath={returnPath} />
        <label className={styles.fieldLabel}>
          Сонгох нийлүүлэгч
          <select name="selected_quotation_id" required>
            <option value="">Сонгох</option>
            {quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.supplier.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={styles.primaryButton}>Шийдвэр хадгалах</button>
      </form>
    );
  }

  if (action.code === "start_contract_draft" || action.code === "start_order_draft") {
    const targetState = action.code === "start_contract_draft" ? "legal_contract_draft" : "contract_draft_started";
    const actionPackages = item.packages.filter((pack) => pack.route_state?.code === targetState);
    return (
      <form action={runProcurementWorkflowAction} className={styles.formStack}>
        <WorkflowHidden item={item} action={action.code} returnPath={returnPath} />
        {actionPackages.length === 1 ? <input type="hidden" name="package_id" value={actionPackages[0].id} /> : null}
        {actionPackages.length > 1 ? <PackageSelect packages={actionPackages} /> : null}
        <label className={styles.fieldLabel}>Тайлбар<textarea name="note" /></label>
        <button type="submit" className={styles.primaryButton}>{ACTION_LABELS[action.code] || action.label}</button>
      </form>
    );
  }

  if (action.code === "upload_order_draft") {
    const actionPackages = item.packages.filter((pack) => pack.route_state?.code === "order_draft_started");
    return (
      <form action={runProcurementWorkflowAction} className={styles.formStack}>
        <WorkflowHidden item={item} action={action.code} returnPath={returnPath} />
        {actionPackages.length === 1 ? <input type="hidden" name="package_id" value={actionPackages[0].id} /> : null}
        {actionPackages.length > 1 ? <PackageSelect packages={actionPackages} /> : null}
        <label className={styles.fieldLabel}>Тайлбар<textarea name="note" /></label>
        <label className={styles.fieldLabel}>
          Тушаалын төсөл docx/pdf
          <input
            type="file"
            name="document_files"
            multiple
            required
            accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
          />
        </label>
        <button type="submit" className={styles.primaryButton}>{ACTION_LABELS[action.code] || action.label}</button>
      </form>
    );
  }

  if (action.code === "record_package_ceo_order") {
    const highPackages = item.packages.filter((pack) => pack.is_over_threshold && ["order_draft_uploaded", "order_approval"].includes(pack.route_state?.code || ""));
    return (
      <form action={runProcurementWorkflowAction} className={styles.formStack}>
        <WorkflowHidden item={item} action={action.code} returnPath={returnPath} />
        <PackageSelect packages={highPackages} />
        {highPackages.some((pack) => pack.order_draft_attachments?.length) ? (
          <div className={styles.inlineDetails}>
            <h4>Хуулийн мэргэжилтнээс ирсэн тушаалын төсөл</h4>
            <ul className={styles.attachmentList}>
              {highPackages.flatMap((pack) =>
                (pack.order_draft_attachments || []).map((attachment) => (
                  <li key={`${pack.id}-${attachment.id}`}>{pack.name}: {attachment.name}</li>
                )),
              )}
            </ul>
          </div>
        ) : null}
        <p className={styles.subtleText}>Нэхэмжлэх оруулсан нийлүүлэгчээр үргэлжилнэ. Нийлүүлэгч дахин сонгох шаардлагагүй.</p>
        <label className={styles.fieldLabel}>Тушаалын дугаар<input name="order_number" /></label>
        <label className={styles.fieldLabel}>Тушаалын огноо<input type="date" name="order_date" required /></label>
        <label className={styles.fieldLabel}>Тайлбар<textarea name="note" /></label>
        <label className={styles.fieldLabel}>Тушаалын файл<input type="file" name="document_files" multiple required /></label>
        <button type="submit" className={styles.primaryButton}>Баталсан тушаал оруулах</button>
      </form>
    );
  }

  if (action.code === "mark_paid") {
    const payablePackages = item.packages.filter((pack) => isPackagePayable(pack, item));
    const selectedQuotationId = getPaymentQuotationId(item);
    const selectedPackage = payablePackages[0];
    const selectedQuote =
      selectedPackage?.ceo_selected_quotation ||
      selectedPackage?.quotations.find((quote) => quote.id === selectedQuotationId) ||
      selectedPackage?.lowest_quotation ||
      item.quotations.find((quote) => quote.id === selectedQuotationId) ||
      item.quotations.find((quote) => quote.is_selected);
    return (
      <form action={runProcurementWorkflowAction} className={styles.formStack} onSubmit={() => setIsSubmitting(true)}>
        <WorkflowHidden item={item} action={action.code} returnPath={returnPath} />
        {payablePackages.length === 1 ? <input type="hidden" name="package_id" value={payablePackages[0].id} /> : null}
        {selectedQuotationId ? <input type="hidden" name="selected_quotation_id" value={selectedQuotationId} /> : null}
        <input type="hidden" name="paid_amount" value={Math.max(1, Math.round(getDisplayTotal(item) || 0))} />
        <label className={styles.fieldLabel}>Нийлүүлэгч<input value={selectedQuote?.supplier.name || item.selected_supplier?.name || "Нийлүүлэгч тодорхойгүй"} readOnly /></label>
        <label className={styles.fieldLabel}>Дүн<input value={Math.max(1, Math.round(getDisplayTotal(item) || 0))} readOnly /></label>
        <label className={styles.fieldLabel}>Банкны данс<input value={selectedQuote?.bank_account_text || "Бүртгэлгүй"} readOnly /></label>
        <label className={styles.fieldLabel}>Гүйлгээний дугаар<input name="payment_reference" required /></label>
        <label className={styles.fieldLabel}>Төлсөн огноо<input type="date" name="payment_date" required /></label>
        <label className={styles.fieldLabel}>Тайлбар<textarea name="note" /></label>
        <label className={styles.fieldLabel}>Төлбөрийн баримт upload<input type="file" name="document_files" multiple required /></label>
        <p className={styles.subtleText}>
          {isSubmitting ? "Төлбөр төлөгдсөнийг баталгаажуулж байна..." : `${item.name} хүсэлтийн төлбөр төлөгдсөнийг баталгаажуулах уу?`}
        </p>
        <div className={styles.buttonRow}>
          <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
            {isSubmitting ? "Илгээж байна..." : "Төлбөр төлөгдсөнийг баталгаажуулах"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={isSubmitting}>Үгүй</button>
        </div>
      </form>
    );
  }

  if (action.code === "mark_contract_signed" || action.code === "mark_received" || action.code === "attach_final_order") {
    const receivablePackages = item.packages.filter(isReceivablePackage);
    const actionPackages =
      action.code === "mark_received" && receivablePackages.length
        ? receivablePackages
        : item.packages;
    return (
      <form
        action={runProcurementWorkflowAction}
        className={styles.formStack}
        onSubmit={action.code === "mark_received" ? () => setIsSubmitting(true) : undefined}
      >
        <WorkflowHidden item={item} action={action.code} returnPath={returnPath} />
        {actionPackages.length === 1 ? <input type="hidden" name="package_id" value={actionPackages[0].id} /> : null}
        {actionPackages.length > 1 ? <PackageSelect packages={actionPackages} optional={action.code !== "mark_received"} /> : null}
        {action.code === "mark_received" ? (
          <>
            <label className={styles.fieldLabel}>Тайлбар<textarea name="note" defaultValue="Хүлээн авалтыг баталгаажуулав." /></label>
            <label className={styles.fieldLabel}>Хүлээн авалтын баримт upload<input type="file" name="document_files" multiple /></label>
            <p className={styles.subtleText}>
              {isSubmitting ? "Хүлээлгэн өгсөн төлөв баталгаажуулж байна..." : `${item.name} хүсэлтийг хүлээлгэн өгсөн болгох уу?`}
            </p>
            <div className={styles.buttonRow}>
              <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
                {isSubmitting ? "Илгээж байна..." : "Тийм"}
              </button>
              <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={isSubmitting}>Үгүй</button>
            </div>
          </>
        ) : (
          <>
            <label className={styles.fieldLabel}>Тайлбар<textarea name="note" /></label>
            <label className={styles.fieldLabel}>
              Файл
              <input
                type="file"
                name="document_files"
                multiple
                required={action.code === "mark_contract_signed"}
                accept={action.code === "mark_contract_signed" ? ".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" : undefined}
              />
            </label>
            <button type="submit" className={styles.primaryButton}>{ACTION_LABELS[action.code] || action.label}</button>
          </>
        )}
      </form>
    );
  }

  return (
    <form action={runProcurementWorkflowAction} className={styles.formStack}>
      <WorkflowHidden item={item} action={action.code} returnPath={returnPath} />
      <p className={styles.subtleText}>Энэ үйлдлийг хадгалахдаа одоогийн шат дараагийн шат руу шилжинэ.</p>
      <button type="submit" className={action.code === "cancel" ? styles.dangerButton : styles.primaryButton}>
        {ACTION_LABELS[action.code] || action.label}
      </button>
    </form>
  );
}

function WorkflowHidden({
  item,
  action,
  returnPath,
}: {
  item: ProcurementRequestDetail;
  action: string;
  returnPath: string;
}) {
  return (
    <>
      <input type="hidden" name="request_id" value={item.id} />
      <input type="hidden" name="workflow_action" value={action} />
      <input type="hidden" name="redirect_path" value={returnPath} />
    </>
  );
}

function PackageSelect({ packages, optional = false }: { packages: ProcurementPackage[]; optional?: boolean }) {
  if (!packages.length) return null;
  return (
    <label className={styles.fieldLabel}>
      Багц
      <select name="package_id" required={!optional}>
        {optional ? <option value="">Бүх хүсэлт</option> : null}
        {packages.map((pack) => (
          <option key={pack.id} value={pack.id}>{pack.name}</option>
        ))}
      </select>
    </label>
  );
}
