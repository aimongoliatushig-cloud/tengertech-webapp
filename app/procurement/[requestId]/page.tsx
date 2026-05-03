import Link from "next/link";

import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import {
  runProcurementWorkflowAction,
  submitProcurementQuotationsAction,
} from "@/app/procurement/actions";
import { requireSession } from "@/lib/auth";
import {
  loadProcurementMe,
  loadProcurementMeta,
  loadProcurementRequestDetail,
  type ProcurementAction,
  type ProcurementCodeLabel,
  type ProcurementMeta,
} from "@/lib/procurement";

import styles from "../procurement.module.css";

type PageProps = {
  params: Promise<{ requestId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("mn-MN").format(value || 0)} төг`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Товлоогүй";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Одоогоор бүртгэгдээгүй";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
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

export const dynamic = "force-dynamic";

export default async function ProcurementDetailPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  const resolvedParams = await params;
  const requestId = Number(resolvedParams.requestId);
  const query = (await searchParams) || {};
  const notice = getValue(query.notice);
  const error = getValue(query.error);

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  const [procurementUser, item] = await Promise.all([
    loadProcurementMe(connectionOverrides),
    loadProcurementRequestDetail(requestId, connectionOverrides),
  ]);

  const submitForQuotationAction = findAction(item.available_actions, "submit_for_quotation");
  const submitQuotesAction = findAction(item.available_actions, "submit_quotations");
  const moveToFinanceAction = findAction(item.available_actions, "move_to_finance_review");
  const prepareOrderAction = findAction(item.available_actions, "prepare_order");
  const directorDecisionAction = findAction(item.available_actions, "director_decision");
  const attachFinalOrderAction = findAction(item.available_actions, "attach_final_order");
  const markContractAction = findAction(item.available_actions, "mark_contract_signed");
  const markPaidAction = findAction(item.available_actions, "mark_paid");
  const markReceivedAction = findAction(item.available_actions, "mark_received");
  const markDoneAction = findAction(item.available_actions, "mark_done");
  const cancelAction = findAction(item.available_actions, "cancel");
  const meta: ProcurementMeta = submitQuotesAction
    ? await loadProcurementMeta(connectionOverrides)
    : { projects: [], tasks: [], departments: [], storekeepers: [], suppliers: [], uoms: [] };

  const activeActionCount = item.available_actions.length;
  const flowLabel = item.flow_type?.label || "Сонголт хүлээж байна";
  const selectedSupplierLabel = item.selected_supplier?.name || "Сонгоогүй";

  const timelineItems = [
    {
      key: "quotation",
      title: "Үнийн саналын шат",
      value: formatDateTime(item.date_quotation_submitted),
      note: item.date_quotation_submitted ? "3 үнийн санал бүртгэгдсэн." : "Үнийн санал хүлээгдэж байна.",
    },
    {
      key: "director",
      title: "Захирлын шийдвэр",
      value: formatDateTime(item.date_director_decision),
      note: item.flow_type?.code === "high" ? "1 саяас дээш урсгалд хэрэглэнэ." : "Бага урсгалд алгасагдана.",
    },
    {
      key: "order",
      title: "Тушаалын шат",
      value: formatDateTime(item.date_order_issued),
      note: item.flow_type?.code === "high" ? "Тушаалын баримт хавсарна." : "Энэ шат шаардахгүй.",
    },
    {
      key: "contract",
      title: "Гэрээний шат",
      value: formatDateTime(item.date_contract_signed),
      note: item.flow_type?.code === "high" ? "Гэрээ байгуулсны дараа үргэлжилнэ." : "Энэ шат шаардахгүй.",
    },
    {
      key: "paid",
      title: "Төлбөрийн шат",
      value: formatDateTime(item.date_paid),
      note: item.payment_status.label,
    },
    {
      key: "received",
      title: "Хүлээн авалтын шат",
      value: formatDateTime(item.date_received),
      note: item.receipt_status.label,
    },
  ];

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title={`${item.name} - ${item.title}`}
      description="Таймлайн, мөр, үнийн санал, баримт, төлбөр, хүлээн авалтын мэдээллийг нэг дэлгэрэнгүй дэлгэцэд нэгтгэв."
      activeTab="list"
    >
      {notice ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{notice}</section> : null}
      {error ? <section className={`${styles.statusBanner} ${styles.errorBanner}`}>{error}</section> : null}

      <section className={styles.overviewPanel}>
        <div className={styles.overviewCopy}>
          <p className={styles.overviewEyebrow}>Дэлгэрэнгүй тойм</p>
          <h2>Шийдвэр, баримт, гүйцэтгэл бүгд нэг харагдацад байна</h2>
          <p>Суурь мэдээлэл, урсгалын төрөл, сонгосон нийлүүлэгч, нээлттэй үйлдлүүдийг эхэнд нь товчлон харуулж байна.</p>
        </div>
        <div className={styles.pillGrid}>
          <article className={styles.pillCard}>
            <span>Урсгал</span>
            <strong>{flowLabel}</strong>
            <small>{item.procurement_type.label}</small>
          </article>
          <article className={styles.pillCard}>
            <span>Сонгосон нийлүүлэгч</span>
            <strong>{selectedSupplierLabel}</strong>
            <small>{formatMoney(item.selected_supplier_total || item.amount_approx_total)}</small>
          </article>
          <article className={styles.pillCard}>
            <span>Идэвхтэй үйлдэл</span>
            <strong>{activeActionCount} боломж</strong>
            <small>Таны эрхээр харагдаж буй дараагийн алхам</small>
          </article>
          <article className={styles.pillCard}>
            <span>Шаардлагатай огноо</span>
            <strong>{formatDate(item.required_date)}</strong>
            <small>{item.is_delayed ? `${item.delay_days} өдөр хоцорсон` : "Одоогоор хоцроогүй"}</small>
          </article>
        </div>
      </section>

      <section className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <span>Одоогийн төлөв</span>
          <strong>{item.state.label}</strong>
          <small>Урсгалын одоогийн шат</small>
        </article>
        <article className={styles.metricCard}>
          <span>Шатанд өнгөрүүлсэн</span>
          <strong>{item.current_stage_age_days} өдөр</strong>
          <small>Одоогийн хариуцагч дээр байгаа хугацаа</small>
        </article>
        <article className={styles.metricCard}>
          <span>Төлбөр</span>
          <strong>{item.payment_status.label}</strong>
          <small>{item.payment_reference || "Лавлагаа оруулаагүй"}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Хүлээн авалт</span>
          <strong>{item.receipt_status.label}</strong>
          <small>{item.received ? "Хаагдсан" : "Дараагийн баталгаажуулалт хүлээж байна"}</small>
        </article>
      </section>

      <section className={styles.detailGrid}>
        <div className={styles.detailStack}>
          <article className={styles.cardSection} id="summary">
            <div className={styles.sectionHeader}>
              <div>
                <h2>Ерөнхий мэдээлэл</h2>
                <p>Одоогийн шат, төсөл, нярав, дүн, хоцролтыг тоймлон харуулна.</p>
              </div>
              <Link href="/procurement" className={styles.secondaryButton}>
                Жагсаалт руу буцах
              </Link>
            </div>
            <div className={styles.infoGrid}>
              <div className={styles.infoCard}>
                <span>Төлөв</span>
                <strong>{item.state.label}</strong>
              </div>
              <div className={styles.infoCard}>
                <span>Төсөл</span>
                <strong>{item.project?.name || "Сонгоогүй"}</strong>
              </div>
              <div className={styles.infoCard}>
                <span>Алба нэгж</span>
                <strong>{item.department?.name || "Сонгоогүй"}</strong>
              </div>
              <div className={styles.infoCard}>
                <span>Хариуцсан нярав</span>
                <strong>{item.storekeeper?.name || "Сонгоогүй"}</strong>
              </div>
              <div className={styles.infoCard}>
                <span>Сонгосон нийлүүлэгч</span>
                <strong>{selectedSupplierLabel}</strong>
              </div>
              <div className={styles.infoCard}>
                <span>Дүн</span>
                <strong>{formatMoney(item.selected_supplier_total || item.amount_approx_total)}</strong>
              </div>
              <div className={styles.infoCard}>
                <span>Одоогийн хариуцагч</span>
                <strong>{item.current_responsible?.name || "Тодорхойгүй"}</strong>
              </div>
              <div className={styles.infoCard}>
                <span>Шаардлагатай огноо</span>
                <strong>{formatDate(item.required_date)}</strong>
              </div>
              <div className={styles.infoCard}>
                <span>Яаралтай түвшин</span>
                <strong>{item.urgency.label}</strong>
              </div>
              <div className={styles.infoCard}>
                <span>Хоцролт</span>
                <strong>{item.is_delayed ? `${item.delay_days} өдөр` : "Хоцроогүй"}</strong>
              </div>
            </div>
            <div className={styles.metaList}>
              <span><strong>Хүсэлт гаргагч:</strong> {item.requester?.name || "Тодорхойгүй"}</span>
              <span><strong>Тайлбар:</strong> {item.description || "Оруулаагүй"}</span>
              <span><strong>Төрөл:</strong> {item.procurement_type.label}</span>
              <span><strong>Урсгал:</strong> {flowLabel}</span>
            </div>
          </article>

          <article className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Шатны таймлайн</h2>
                <p>Огноо бүхий гол үйл явдлууд</p>
              </div>
            </div>
            <div className={styles.timelineGrid}>
              {timelineItems.map((timelineItem) => (
                <div key={timelineItem.key} className={styles.timelineItem}>
                  <strong>{timelineItem.title}</strong>
                  <span>{timelineItem.value}</span>
                  <small>{timelineItem.note}</small>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.cardSection} id="lines">
            <div className={styles.sectionHeader}>
              <div>
                <h2>Хүсэлтийн мөрүүд</h2>
                <p>Анхны хэрэгцээний мөрүүд</p>
              </div>
            </div>
            {item.lines.length ? (
              <div className={styles.tableList}>
                {item.lines.map((line) => (
                  <div key={line.id} className={styles.tableRow}>
                    <div className={styles.tableRowHeader}>
                      <strong>{line.product_name || `Мөр ${line.sequence}`}</strong>
                      <span className={styles.badgeOutline}>{formatMoney(line.approx_subtotal)}</span>
                    </div>
                    <span className={styles.subtleText}>
                      {line.quantity} {line.uom?.name || ""} - {line.specification || "Тодорхойлолт оруулаагүй"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Хүсэлтийн мөр бүртгэгдээгүй байна.</div>
            )}
          </article>

          <article className={styles.cardSection} id="quotes">
            <div className={styles.sectionHeader}>
              <div>
                <h2>Үнийн саналууд</h2>
                <p>3 нийлүүлэгчийн сонголт, дүн, файлууд</p>
              </div>
            </div>
            {item.quotations.length ? (
              <div className={styles.tableList}>
                {item.quotations.map((quotation) => (
                  <div key={quotation.id} className={styles.tableRow}>
                    <div className={styles.tableRowHeader}>
                      <strong>{quotation.supplier.name}</strong>
                      <span className={quotation.is_selected ? styles.badge : styles.badgeOutline}>
                        {quotation.is_selected ? "Сонгосон" : "Сонгоогүй"}
                      </span>
                    </div>
                    <span className={styles.subtleText}>
                      {formatMoney(quotation.amount_total)} - {quotation.quotation_ref || "Дугааргүй"}
                    </span>
                    {quotation.attachments.length ? (
                      <ul>
                        {quotation.attachments.map((attachment) => (
                          <li key={attachment.id}>{attachment.name}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Одоогоор үнийн санал бүртгэгдээгүй байна.</div>
            )}
          </article>

          {submitQuotesAction ? (
            <article className={styles.cardSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>3 үнийн санал оруулах</h2>
                  <p>Няравын баталгаажуулах 3 нийлүүлэгчийн мэдээлэл</p>
                </div>
              </div>
              <form action={submitProcurementQuotationsAction} className={styles.quoteForm}>
                <input type="hidden" name="request_id" value={item.id} />
                <div className={styles.radioRow}>
                  {[1, 2, 3].map((index) => (
                    <label key={index} className={styles.radioChoice}>
                      <input
                        type="radio"
                        name="selected_quote_index"
                        value={index}
                        defaultChecked={
                          (item.quotations[index - 1]?.is_selected ?? false) ||
                          (!item.selected_quotation_id && index === 1)
                        }
                      />
                      Сонгосон санал {index}
                    </label>
                  ))}
                </div>
                <div className={styles.quoteGrid}>
                  {[1, 2, 3].map((index) => (
                    <article key={index} className={styles.quoteCard}>
                      <h3>Үнийн санал {index}</h3>
                      <label>
                        Нийлүүлэгч
                        <select
                          name={`supplier_id_${index}`}
                          required
                          defaultValue={item.quotations[index - 1]?.supplier.id || ""}
                        >
                          <option value="">Сонгох</option>
                          {meta.suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Лавлагааны дугаар
                        <input
                          name={`quotation_ref_${index}`}
                          defaultValue={item.quotations[index - 1]?.quotation_ref || ""}
                        />
                      </label>
                      <label>
                        Огноо
                        <input
                          type="date"
                          name={`quotation_date_${index}`}
                          defaultValue={item.quotations[index - 1]?.quotation_date || ""}
                        />
                      </label>
                      <label>
                        Нийт дүн
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          name={`amount_total_${index}`}
                          defaultValue={item.quotations[index - 1]?.amount_total || ""}
                        />
                      </label>
                      <label>
                        Хүргэлтийн огноо
                        <input
                          type="date"
                          name={`expected_delivery_date_${index}`}
                          defaultValue={item.quotations[index - 1]?.expected_delivery_date || ""}
                        />
                      </label>
                      <label>
                        Төлбөрийн нөхцөл
                        <input
                          name={`payment_terms_${index}`}
                          defaultValue={item.quotations[index - 1]?.payment_terms_text || ""}
                        />
                      </label>
                      <label>
                        Нийлүүлэлтийн нөхцөл
                        <input
                          name={`delivery_terms_${index}`}
                          defaultValue={item.quotations[index - 1]?.delivery_terms_text || ""}
                        />
                      </label>
                      <label>
                        Тайлбар
                        <textarea
                          name={`quote_note_${index}`}
                          defaultValue={item.quotations[index - 1]?.notes || ""}
                        />
                      </label>
                      <label>
                        Хавсралт
                        <input type="file" name={`quote_file_${index}`} />
                      </label>
                    </article>
                  ))}
                </div>
                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.primaryButton}>
                    {submitQuotesAction.label}
                  </button>
                </div>
              </form>
            </article>
          ) : null}

          <article className={styles.cardSection} id="documents">
            <div className={styles.sectionHeader}>
              <div>
                <h2>Баримтууд</h2>
                <p>Тушаал, гэрээ, төлбөр, хүлээн авалтын хавсралтууд</p>
              </div>
            </div>
            {item.documents.length ? (
              <div className={styles.documentList}>
                {item.documents.map((document) => (
                  <div key={document.id} className={styles.documentCard}>
                    <div className={styles.tableRowHeader}>
                      <strong>{document.document_type.label}</strong>
                      {document.is_required ? <span className={styles.badge}>Шаардлагатай</span> : null}
                    </div>
                    <p className={styles.subtleText}>{document.note || "Тайлбаргүй"}</p>
                    {document.attachments.length ? (
                      <ul>
                        {document.attachments.map((attachment) => (
                          <li key={attachment.id}>{attachment.name}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.subtleText}>Хавсралтгүй</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Одоогоор баримт хавсаргаагүй байна.</div>
            )}
          </article>

          {item.attachments.length ? (
            <article className={styles.cardSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Ерөнхий хавсралт</h2>
                  <p>Хүсэлт дээр шууд хавсаргасан файлууд</p>
                </div>
              </div>
              <div className={styles.tableList}>
                {item.attachments.map((attachment) => (
                  <div key={attachment.id} className={styles.tableRow}>
                    <div className={styles.tableRowHeader}>
                      <strong>{attachment.name}</strong>
                      <span className={styles.badgeOutline}>{attachment.mimetype || "Файл"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <article className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Өөрчлөлтийн түүх</h2>
                <p>Хэн, хэзээ, ямар шат руу шилжүүлснийг харуулна.</p>
              </div>
            </div>
            {item.audit.length ? (
              <div className={styles.tableList}>
                {item.audit.map((audit) => (
                  <div key={audit.id} className={styles.tableRow}>
                    <div className={styles.tableRowHeader}>
                      <strong>{audit.action_label}</strong>
                      <span className={styles.badgeOutline}>{formatDateTime(audit.changed_at)}</span>
                    </div>
                    <span className={styles.subtleText}>
                      {formatStatePair(audit.old_state, audit.new_state)} - {audit.user.name}
                    </span>
                    {audit.note ? <span className={styles.subtleText}>{audit.note}</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Аудитын бүртгэл хараахан үүсээгүй байна.</div>
            )}
          </article>

          <nav className={styles.stickyActionBar} aria-label="Хурдан шилжих хэсгүүд">
            <a href="#summary" className={styles.stickyActionLink}>
              Ерөнхий
            </a>
            <a href="#lines" className={styles.stickyActionLink}>
              Мөрүүд
            </a>
            <a href="#quotes" className={styles.stickyActionLink}>
              Үнийн санал
            </a>
            <a href="#documents" className={styles.stickyActionLink}>
              Баримт
            </a>
            <a href="#actions" className={styles.stickyActionLink}>
              Үйлдэл
            </a>
          </nav>
        </div>

        <aside className={styles.detailStack} id="actions">
          <article className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Үйлдлийн самбар</h2>
                <p>Одоогийн эрхээр харагдах боломжтой товчлуурууд</p>
              </div>
            </div>
            {item.available_actions.length ? (
              <div className={styles.badgeRow}>
                {item.available_actions.map((action) => (
                  <span key={action.code} className={styles.badgeOutline}>
                    {action.label}
                  </span>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Одоогийн шатанд танд шууд хийх үйлдэл алга.</div>
            )}
          </article>

          {submitForQuotationAction ? (
            <article className={styles.cardSection}>
              <form action={runProcurementWorkflowAction}>
                <input type="hidden" name="request_id" value={item.id} />
                <input type="hidden" name="workflow_action" value="submit_for_quotation" />
                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.primaryButton}>
                    {submitForQuotationAction.label}
                  </button>
                </div>
              </form>
            </article>
          ) : null}

          {moveToFinanceAction ? (
            <article className={styles.cardSection}>
              <form action={runProcurementWorkflowAction}>
                <input type="hidden" name="request_id" value={item.id} />
                <input type="hidden" name="workflow_action" value="move_to_finance_review" />
                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.secondaryButton}>
                    {moveToFinanceAction.label}
                  </button>
                </div>
              </form>
            </article>
          ) : null}

          {prepareOrderAction ? (
            <article className={styles.cardSection}>
              <form action={runProcurementWorkflowAction}>
                <input type="hidden" name="request_id" value={item.id} />
                <input type="hidden" name="workflow_action" value="prepare_order" />
                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.primaryButton}>
                    {prepareOrderAction.label}
                  </button>
                </div>
              </form>
            </article>
          ) : null}

          {directorDecisionAction ? (
            <article className={styles.cardSection}>
              <form action={runProcurementWorkflowAction} className={styles.quoteForm}>
                <input type="hidden" name="request_id" value={item.id} />
                <input type="hidden" name="workflow_action" value="director_decision" />
                <label className={styles.fieldLabel}>
                  Батлах үнийн санал
                  <select name="selected_quotation_id" defaultValue={item.selected_quotation_id || ""}>
                    <option value="">Сонгох</option>
                    {item.quotations.map((quotation) => (
                      <option key={quotation.id} value={quotation.id}>
                        {quotation.supplier.name} - {formatMoney(quotation.amount_total)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.primaryButton}>
                    {directorDecisionAction.label}
                  </button>
                </div>
              </form>
            </article>
          ) : null}

          {attachFinalOrderAction || markContractAction || markPaidAction || markReceivedAction ? (
            <article className={styles.cardSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Баримттай үйлдлүүд</h2>
                  <p>Тушаал, гэрээ, төлбөр, хүлээн авалтын шатанд ашиглана.</p>
                </div>
              </div>

              {attachFinalOrderAction ? (
                <form action={runProcurementWorkflowAction} className={styles.quoteForm}>
                  <input type="hidden" name="request_id" value={item.id} />
                  <input type="hidden" name="workflow_action" value="attach_final_order" />
                  <label className={styles.fieldLabel}>
                    Тайлбар
                    <textarea name="note" placeholder="Эцсийн тушаалын тайлбар" />
                  </label>
                  <label className={styles.fieldLabel}>
                    Эцсийн тушаалын файл
                    <input type="file" name="document_files" multiple />
                  </label>
                  <div className={styles.buttonRow}>
                    <button type="submit" className={styles.primaryButton}>
                      {attachFinalOrderAction.label}
                    </button>
                  </div>
                </form>
              ) : null}

              {markContractAction ? (
                <form action={runProcurementWorkflowAction} className={styles.quoteForm}>
                  <input type="hidden" name="request_id" value={item.id} />
                  <input type="hidden" name="workflow_action" value="mark_contract_signed" />
                  <label className={styles.fieldLabel}>
                    Тайлбар
                    <textarea name="note" placeholder="Гэрээний нэмэлт тайлбар" />
                  </label>
                  <label className={styles.fieldLabel}>
                    Эцсийн гэрээний файл
                    <input type="file" name="document_files" multiple />
                  </label>
                  <div className={styles.buttonRow}>
                    <button type="submit" className={styles.primaryButton}>
                      {markContractAction.label}
                    </button>
                  </div>
                </form>
              ) : null}

              {markPaidAction ? (
                <form action={runProcurementWorkflowAction} className={styles.quoteForm}>
                  <input type="hidden" name="request_id" value={item.id} />
                  <input type="hidden" name="workflow_action" value="mark_paid" />
                  {item.quotations.length ? (
                    <label className={styles.fieldLabel}>
                      Сонгосон үнийн санал
                      <select name="selected_quotation_id" defaultValue={item.selected_quotation_id || ""}>
                        <option value="">Сонгох</option>
                        {item.quotations.map((quotation) => (
                          <option key={quotation.id} value={quotation.id}>
                            {quotation.supplier.name} - {formatMoney(quotation.amount_total)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className={styles.fieldLabel}>
                    Төлсөн дүн
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="paid_amount"
                      defaultValue={item.paid_amount || ""}
                      required
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Төлбөрийн лавлагаа
                    <input name="payment_reference" defaultValue={item.payment_reference || ""} />
                  </label>
                  <label className={styles.fieldLabel}>
                    Төлбөрийн өдөр
                    <input type="date" name="payment_date" defaultValue={item.payment_date || ""} />
                  </label>
                  <label className={styles.fieldLabel}>
                    Тайлбар
                    <textarea name="note" placeholder="Төлбөрийн тэмдэглэл" />
                  </label>
                  <label className={styles.fieldLabel}>
                    Төлбөрийн баримт
                    <input type="file" name="document_files" multiple />
                  </label>
                  <div className={styles.buttonRow}>
                    <button type="submit" className={styles.primaryButton}>
                      {markPaidAction.label}
                    </button>
                  </div>
                </form>
              ) : null}

              {markReceivedAction ? (
                <form action={runProcurementWorkflowAction} className={styles.quoteForm}>
                  <input type="hidden" name="request_id" value={item.id} />
                  <input type="hidden" name="workflow_action" value="mark_received" />
                  <label className={styles.fieldLabel}>
                    Хүлээн авалтын тэмдэглэл
                    <textarea name="note" placeholder="Хүлээн авалтын тайлбар" />
                  </label>
                  <label className={styles.fieldLabel}>
                    Баримт
                    <input type="file" name="document_files" multiple />
                  </label>
                  <div className={styles.buttonRow}>
                    <button type="submit" className={styles.primaryButton}>
                      {markReceivedAction.label}
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          ) : null}

          {markDoneAction ? (
            <article className={styles.cardSection}>
              <form action={runProcurementWorkflowAction}>
                <input type="hidden" name="request_id" value={item.id} />
                <input type="hidden" name="workflow_action" value="mark_done" />
                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.primaryButton}>
                    {markDoneAction.label}
                  </button>
                </div>
              </form>
            </article>
          ) : null}

          {cancelAction ? (
            <article className={styles.cardSection}>
              <form action={runProcurementWorkflowAction}>
                <input type="hidden" name="request_id" value={item.id} />
                <input type="hidden" name="workflow_action" value="cancel" />
                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.dangerButton}>
                    {cancelAction.label}
                  </button>
                </div>
              </form>
            </article>
          ) : null}
        </aside>
      </section>
    </ProcurementShell>
  );
}
