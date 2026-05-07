import Link from "next/link";
import Image from "next/image";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import {
  createFieldStopIssueAction,
  markFieldStopArrivedAction,
  markFieldStopDoneAction,
  markFieldStopSkippedAction,
  saveFieldStopNoteAction,
  startFieldShiftAction,
  submitFieldShiftAction,
  uploadFieldStopProofAction,
} from "@/app/actions";
import { BestEffortGpsFields } from "@/app/field/best-effort-gps-fields";
import fieldStyles from "@/app/field/field.module.css";
import workspaceStyles from "@/app/workspace.module.css";
import { getRoleLabel, hasCapability, isWorkerOnly, requireSession } from "@/lib/auth";
import { loadAssignedGarbageTasks, type FieldStop } from "@/lib/field-ops";

export const dynamic = "force-dynamic";

const ISSUE_TYPE_OPTIONS = [
  { value: "route", label: "Маршрутын асуудал" },
  { value: "vehicle", label: "Машины асуудал" },
  { value: "crew", label: "Багийн асуудал" },
  { value: "safety", label: "Аюулгүй байдлын эрсдэл" },
  { value: "citizen", label: "Иргэний гомдол" },
  { value: "other", label: "Бусад" },
];

const ISSUE_SEVERITY_OPTIONS = [
  { value: "low", label: "Бага" },
  { value: "medium", label: "Дунд" },
  { value: "high", label: "Өндөр" },
  { value: "critical", label: "Ноцтой" },
];

type PageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    notice?: string | string[];
    taskId?: string | string[];
  }>;
};

function getMessage(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function parseTaskId(value?: string | string[]) {
  const raw = getMessage(value);
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function statusTone(stop: FieldStop) {
  if (stop.status === "done") {
    return fieldStyles.stopDone;
  }
  if (stop.status === "skipped") {
    return fieldStyles.stopSkipped;
  }
  if (stop.status === "arrived") {
    return fieldStyles.stopArrived;
  }
  return fieldStyles.stopDraft;
}

function getTodayLabel() {
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

export default async function FieldPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const query = (await searchParams) ?? {};
  const selectedTaskId = parseTaskId(query.taskId);
  const noticeMessage = getMessage(query.notice);
  const errorMessage = getMessage(query.error);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const workerMode = isWorkerOnly(session);

  let fieldLoadError = "";
  let bundle: Awaited<ReturnType<typeof loadAssignedGarbageTasks>> = {
    requestedDate: "",
    requestedDateLabel: getTodayLabel(),
    assignments: [],
    activeAssignment: null,
  };

  if (canUseFieldConsole) {
    try {
      bundle = await loadAssignedGarbageTasks(
        {
          userId: session.uid,
          selectedTaskId,
        },
        {
          login: session.login,
          password: session.password,
        },
      );
    } catch (error) {
      fieldLoadError =
        error instanceof Error && error.message
          ? error.message
          : "Талбарын маршрутын мэдээллийг Odoo-оос уншиж чадсангүй.";
    }
  }

  const assignment = bundle.activeAssignment;

  return (
    <main className={workspaceStyles.shell}>
      <div className={workspaceStyles.container}>
        <WorkspaceHeader
          title="Талбарын маршрут"
          subtitle="Өнөөдрийн маршрут, талбарын хяналтын урсгал"
          userName={session.name}
          roleLabel={getRoleLabel(session.role)}
          notificationCount={bundle.assignments.length}
          notificationNote={`${bundle.assignments.length} маршрут өнөөдөр оноогдсон байна`}
        />

        <header className={workspaceStyles.navBar}>
          <div className={workspaceStyles.navLinks}>
            <Link href="/" className={workspaceStyles.backLink}>
              {workerMode ? "Миний ажил" : "Хяналтын самбар"}
            </Link>
            <span>{getRoleLabel(session.role)}</span>
            <span>{session.name}</span>
          </div>

          <div className={workspaceStyles.navActions}>
            <form action="/auth/logout" method="post">
              <button type="submit" className={workspaceStyles.secondaryButton}>
                Гарах
              </button>
            </form>
          </div>
        </header>

        <AppMenu
          active="field"
          canCreateProject={canCreateProject}
          canCreateTasks={canCreateTasks}
          canWriteReports={canWriteReports}
          canViewQualityCenter={canViewQualityCenter}
          canUseFieldConsole={canUseFieldConsole}
          userName={session.name}
          roleLabel={getRoleLabel(session.role)}
          groupFlags={session.groupFlags}
          workerMode={workerMode}
        />

        <section className={`${workspaceStyles.heroCard} ${fieldStyles.heroCard}`}>
          <span className={workspaceStyles.eyebrow}>Талбарын гар утасны урсгал</span>
          <h1>Өнөөдрийн маршрут</h1>
          <p>
            Жолооч, хянагч нар ээлж эхлүүлж, цэг тус бүрээр ажиллаад, өмнөх ба дараах
            баталгааны зургаа оруулж, асуудал бүртгээд, дууссан маршрутаа хяналтад
            илгээх боломжтой.
          </p>

          <div className={fieldStyles.heroFacts}>
            <article className={workspaceStyles.statCard}>
              <span>Огноо</span>
              <strong>{bundle.requestedDateLabel}</strong>
            </article>
            <article className={workspaceStyles.statCard}>
              <span>Оноогдсон маршрут</span>
              <strong>{bundle.assignments.length}</strong>
            </article>
            <article className={workspaceStyles.statCard}>
              <span>Эрх</span>
              <strong>{getRoleLabel(session.role)}</strong>
            </article>
          </div>
        </section>

        {errorMessage ? (
          <div className={`${workspaceStyles.message} ${workspaceStyles.errorMessage}`}>
            {errorMessage}
          </div>
        ) : null}
        {fieldLoadError ? (
          <div className={`${workspaceStyles.message} ${workspaceStyles.errorMessage}`}>
            {fieldLoadError}
          </div>
        ) : null}
        {noticeMessage ? (
          <div className={`${workspaceStyles.message} ${workspaceStyles.noticeMessage}`}>
            {noticeMessage}
          </div>
        ) : null}

        {canUseFieldConsole && bundle.assignments.length > 1 ? (
          <section className={fieldStyles.routeSelector}>
            {bundle.assignments.map((item) => (
              <Link
                key={item.id}
                href={`/field?taskId=${item.id}`}
                className={`${fieldStyles.routeChip} ${
                  assignment?.id === item.id ? fieldStyles.routeChipActive : ""
                }`}
              >
                <span>{item.vehicleName}</span>
                <strong>{item.routeName}</strong>
                <small>
                  {item.completedStopCount}/{item.stopCount} цэг
                </small>
              </Link>
            ))}
          </section>
        ) : null}

        {!canUseFieldConsole ? (
          <section className={workspaceStyles.emptyState}>
            <h2>Энэ хуудас талбарын хэрэглэгчдэд зориулагдсан</h2>
            <p>
              Үйл ажиллагаа хариуцсан менежер, ажлын хяналтын хэрэглэгчид энэ хэсгийг ашиглахгүй.
              Хяналтын самбар, ажил, тайлан хэсгээс ажлаа үргэлжлүүлнэ үү.
            </p>
          </section>
        ) : fieldLoadError ? (
          <section className={workspaceStyles.emptyState}>
            <h2>Маршрутын мэдээлэл түр уншигдсангүй</h2>
            <p>
              Odoo серверээс талбарын өгөгдөл авах үед алдаа гарлаа. Дахин сэргээж
              үзээд, алдаа хэвээр байвал Odoo талын эрх болон model field-үүдийг нягтална уу.
            </p>
          </section>
        ) : !assignment ? (
          <section className={workspaceStyles.emptyState}>
            <h2>Өнөөдөр оноогдсон хогийн маршрут алга</h2>
            <p>
              Диспетчер танай жолооч эсвэл хянагчийн эрх дээр хог тээвэрлэлтийн ажил
              оноовол энд автоматаар харагдана.
            </p>
          </section>
        ) : (
          <>
            <section className={fieldStyles.summaryGrid}>
              <section className={workspaceStyles.panel}>
                <div className={workspaceStyles.sectionHeader}>
                  <div>
                    <span className={workspaceStyles.eyebrow}>Маршрутын товч</span>
                    <h2>{assignment.routeName}</h2>
                  </div>
                  <span className={fieldStyles.statePill}>{assignment.stateLabel}</span>
                </div>

                <div className={fieldStyles.summaryFacts}>
                  <div>
                    <span>Машин</span>
                    <strong>{assignment.vehicleName}</strong>
                  </div>
                  <div>
                    <span>Дүүрэг</span>
                    <strong>{assignment.districtName}</strong>
                  </div>
                  <div>
                    <span>Жолооч</span>
                    <strong>{assignment.driverName}</strong>
                  </div>
                  <div>
                    <span>Хянагч</span>
                    <strong>{assignment.inspectorName}</strong>
                  </div>
                  <div>
                    <span>Ээлж</span>
                    <strong>{assignment.shiftTypeLabel}</strong>
                  </div>
                  <div>
                    <span>Цуглуулсан жин</span>
                    <strong>{assignment.totalNetWeightLabel}</strong>
                  </div>
                </div>

                <div className={workspaceStyles.progressTrack}>
                  <span style={{ width: `${assignment.progressPercent}%` }} />
                </div>

                <div className={fieldStyles.summaryStats}>
                  <div>
                    <span>Цэг</span>
                    <strong>{assignment.stopCount}</strong>
                  </div>
                  <div>
                    <span>Дууссан</span>
                    <strong>{assignment.completedStopCount}</strong>
                  </div>
                  <div>
                    <span>Алгассан</span>
                    <strong>{assignment.skippedStopCount}</strong>
                  </div>
                  <div>
                    <span>Нээлттэй</span>
                    <strong>{assignment.unresolvedStopCount}</strong>
                  </div>
                  <div>
                    <span>Баталгааны зураг</span>
                    <strong>{assignment.proofCount}</strong>
                  </div>
                  <div>
                    <span>Асуудал</span>
                    <strong>{assignment.issueCount}</strong>
                  </div>
                </div>
              </section>

              <aside className={`${workspaceStyles.formCard} ${fieldStyles.stickySummary}`}>
                <div className={workspaceStyles.sectionHeader}>
                  <div>
                    <span className={workspaceStyles.eyebrow}>Ээлжийн үйлдэл</span>
                    <h2>Ажиллахад бэлэн</h2>
                  </div>
                </div>

                <div className={fieldStyles.timeline}>
                  <div>
                    <span>Хуваарилсан</span>
                    <strong>{assignment.dispatchedAt}</strong>
                  </div>
                  <div>
                    <span>Эхэлсэн</span>
                    <strong>{assignment.startedAt}</strong>
                  </div>
                  <div>
                    <span>Илгээсэн</span>
                    <strong>{assignment.endedAt}</strong>
                  </div>
                </div>

                {assignment.returnedReason ? (
                  <div className={fieldStyles.returnedNotice}>
                    <strong>Буцаасан шалтгаан</strong>
                    <p>{assignment.returnedReason}</p>
                  </div>
                ) : null}

                {assignment.canStart ? (
                  <form action={startFieldShiftAction} className={workspaceStyles.form}>
                    <input type="hidden" name="task_id" value={assignment.id} />
                    <button type="submit" className={workspaceStyles.primaryButton}>
                      Ээлж эхлүүлэх
                    </button>
                  </form>
                ) : null}

                <form action={submitFieldShiftAction} className={workspaceStyles.form}>
                  <input type="hidden" name="task_id" value={assignment.id} />
                  <div className={workspaceStyles.field}>
                    <label htmlFor="summary">Ээлжийн төгсгөлийн товч</label>
                    <textarea
                      id="summary"
                      name="summary"
                      defaultValue={assignment.endShiftSummary}
                        placeholder="Хяналтад илгээхээсээ өмнө ээлжийн товч тайлангаа бичнэ үү."
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className={workspaceStyles.secondaryButton}
                    disabled={!assignment.canSubmit}
                  >
                      Хяналтад илгээх
                  </button>
                </form>

                <div className={fieldStyles.alertList}>
                  <div className={fieldStyles.alertCard}>
                    <span>Хаагдаагүй цэг</span>
                    <strong>{assignment.unresolvedStopCount}</strong>
                  </div>
                  <div className={fieldStyles.alertCard}>
                    <span>Зураг дутуу дууссан цэг</span>
                    <strong>{assignment.missingProofStopCount}</strong>
                  </div>
                </div>

                {assignment.weightTotals.length ? (
                  <div className={fieldStyles.weightList}>
                    {assignment.weightTotals.map((weight) => (
                      <article key={weight.id} className={fieldStyles.weightCard}>
                        <strong>{weight.netWeightTotal.toFixed(2)} тн</strong>
                        <span>{weight.sourceLabel}</span>
                        {weight.externalReference ? <small>{weight.externalReference}</small> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={fieldStyles.helperText}>
                    Шөнийн WRS синк ажилласны дараа жингийн дүн энд харагдана.
                  </p>
                )}
              </aside>
            </section>

            <section className={fieldStyles.stopList}>
              {assignment.stops.map((stop) => (
                <article
                  key={stop.id}
                  id={`stop-${stop.id}`}
                  className={`${fieldStyles.stopCard} ${statusTone(stop)}`}
                >
                  <div className={fieldStyles.stopTop}>
                    <div>
                      <span className={fieldStyles.stopSequence}>Цэг {stop.sequence}</span>
                      <h3>{stop.collectionPointName}</h3>
                      <p>
                        {stop.districtName}
                        {stop.subdistrictName ? ` / ${stop.subdistrictName}` : ""}
                      </p>
                    </div>
                    <span className={fieldStyles.stopStatus}>{stop.statusLabel}</span>
                  </div>

                  <div className={fieldStyles.stopMeta}>
                    <div>
                      <span>Төлөвлөсөн очих цаг</span>
                      <strong>{stop.plannedArrivalLabel}</strong>
                    </div>
                    <div>
                      <span>Үйлчлэх хугацаа</span>
                      <strong>{stop.plannedServiceLabel}</strong>
                    </div>
                    <div>
                      <span>Очсон</span>
                      <strong>{stop.arrivalLabel}</strong>
                    </div>
                    <div>
                      <span>Гарсан</span>
                      <strong>{stop.departureLabel}</strong>
                    </div>
                  </div>

                  <div className={workspaceStyles.chipRow}>
                    <span className={workspaceStyles.chip}>{stop.proofCount} баталгааны зураг</span>
                    <span className={workspaceStyles.chip}>{stop.issueCount} асуудал</span>
                    {stop.missingProofTypes.length ? (
                      <span className={workspaceStyles.chip}>
                        Дутуу: {stop.missingProofTypes.join(", ")}
                      </span>
                    ) : null}
                    {stop.skipReason ? (
                      <span className={workspaceStyles.chip}>
                        Алгассан шалтгаан: {stop.skipReason}
                      </span>
                    ) : null}
                  </div>

                  <div className={fieldStyles.actionRow}>
                    {stop.status === "draft" ? (
                      <form action={markFieldStopArrivedAction}>
                        <input type="hidden" name="task_id" value={assignment.id} />
                        <input type="hidden" name="stop_line_id" value={stop.id} />
                        <button type="submit" className={workspaceStyles.secondaryButton}>
                          Очсонд тэмдэглэх
                        </button>
                      </form>
                    ) : null}

                    {!["done", "skipped"].includes(stop.status) ? (
                      <form action={markFieldStopDoneAction}>
                        <input type="hidden" name="task_id" value={assignment.id} />
                        <input type="hidden" name="stop_line_id" value={stop.id} />
                        <button type="submit" className={workspaceStyles.primaryButton}>
                          Дууссанд тэмдэглэх
                        </button>
                      </form>
                    ) : null}
                  </div>

                  <div className={fieldStyles.detailsGrid}>
                    <details className={fieldStyles.detailCard} open={stop.status !== "done"}>
                      <summary>Баталгааны зураг</summary>
                      <form action={uploadFieldStopProofAction} className={workspaceStyles.form}>
                        <input type="hidden" name="task_id" value={assignment.id} />
                        <input type="hidden" name="stop_line_id" value={stop.id} />
                        <div className={workspaceStyles.field}>
                          <label htmlFor={`proof_type_${stop.id}`}>Зургийн төрөл</label>
                          <select
                            id={`proof_type_${stop.id}`}
                            name="proof_type"
                            defaultValue="before"
                          >
                            <option value="before">Өмнө</option>
                            <option value="after">Дараа</option>
                          </select>
                        </div>
                        <div className={workspaceStyles.field}>
                          <label htmlFor={`image_${stop.id}`}>Зураг</label>
                          <input
                            id={`image_${stop.id}`}
                            type="file"
                            name="image"
                            accept="image/*"
                            capture="environment"
                            required
                          />
                        </div>
                        <div className={workspaceStyles.field}>
                          <label htmlFor={`proof_description_${stop.id}`}>Тайлбар</label>
                          <input
                            id={`proof_description_${stop.id}`}
                            type="text"
                            name="description"
                            placeholder="Зургийн тайлбар оруулж болно"
                          />
                        </div>
                        <BestEffortGpsFields />
                        <button type="submit" className={workspaceStyles.secondaryButton}>
                          Баталгааны зураг оруулах
                        </button>
                      </form>

                      {stop.proofs.length ? (
                        <div className={fieldStyles.historyList}>
                          {stop.proofs.map((proof) => (
                            <article key={proof.id} className={fieldStyles.historyCard}>
                              <a href={proof.imageUrl} target="_blank" rel="noreferrer">
                                <Image
                                  src={proof.imageUrl}
                                  alt={`${proof.proofTypeLabel} зураг`}
                                  className={fieldStyles.historyImage}
                                  width={320}
                                  height={240}
                                  unoptimized
                                />
                              </a>
                              <strong>{proof.proofTypeLabel}</strong>
                              <span>{proof.capturedAt}</span>
                              <small>{proof.uploader}</small>
                              {proof.description ? <p>{proof.description}</p> : null}
                              {proof.gpsLabel ? <small>{proof.gpsLabel}</small> : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className={fieldStyles.helperText}>
                          Цэгийг дууссанд тэмдэглэхээс өмнө өмнөх ба дараах зургийг хоёуланг нь оруулна уу.
                        </p>
                      )}
                    </details>

                    <details className={fieldStyles.detailCard}>
                      <summary>Цэг алгасах</summary>
                      <form action={markFieldStopSkippedAction} className={workspaceStyles.form}>
                        <input type="hidden" name="task_id" value={assignment.id} />
                        <input type="hidden" name="stop_line_id" value={stop.id} />
                        <div className={workspaceStyles.field}>
                          <label htmlFor={`skip_reason_${stop.id}`}>Шалтгаан</label>
                          <textarea
                            id={`skip_reason_${stop.id}`}
                            name="skip_reason"
                            defaultValue={stop.skipReason}
                            placeholder="Энэ цэгийг яагаад алгассанаа тайлбарлана уу."
                            required
                          />
                        </div>
                        <button type="submit" className={workspaceStyles.dangerButton}>
                          Алгассанд тэмдэглэх
                        </button>
                      </form>
                    </details>

                    <details className={fieldStyles.detailCard}>
                      <summary>Тэмдэглэл ба асуудлын бүртгэл</summary>
                      <form action={saveFieldStopNoteAction} className={workspaceStyles.form}>
                        <input type="hidden" name="task_id" value={assignment.id} />
                        <input type="hidden" name="stop_line_id" value={stop.id} />
                        <div className={workspaceStyles.field}>
                          <label htmlFor={`note_${stop.id}`}>Цэгийн тэмдэглэл</label>
                          <textarea
                            id={`note_${stop.id}`}
                            name="note"
                            defaultValue={stop.note}
                            placeholder="Энэ цэг дээрх тэмдэглэлийг хадгална."
                          />
                        </div>
                        <button type="submit" className={workspaceStyles.secondaryButton}>
                          Тэмдэглэл хадгалах
                        </button>
                      </form>

                      <form action={createFieldStopIssueAction} className={workspaceStyles.form}>
                        <input type="hidden" name="task_id" value={assignment.id} />
                        <input type="hidden" name="stop_line_id" value={stop.id} />
                        <div className={workspaceStyles.field}>
                          <label htmlFor={`issue_title_${stop.id}`}>Асуудлын гарчиг</label>
                          <input
                            id={`issue_title_${stop.id}`}
                            type="text"
                            name="title"
                            placeholder="Товч гарчиг"
                            required
                          />
                        </div>
                        <div className={fieldStyles.inlineFields}>
                          <div className={workspaceStyles.field}>
                            <label htmlFor={`issue_type_${stop.id}`}>Асуудлын төрөл</label>
                            <select
                              id={`issue_type_${stop.id}`}
                              name="issue_type"
                              defaultValue="other"
                            >
                              {ISSUE_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className={workspaceStyles.field}>
                            <label htmlFor={`severity_${stop.id}`}>Ноцтой түвшин</label>
                            <select
                              id={`severity_${stop.id}`}
                              name="severity"
                              defaultValue="medium"
                            >
                              {ISSUE_SEVERITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className={workspaceStyles.field}>
                          <label htmlFor={`issue_description_${stop.id}`}>Тайлбар</label>
                          <textarea
                            id={`issue_description_${stop.id}`}
                            name="description"
                            placeholder="Энэ цэг дээрх асуудлыг тайлбарлана уу."
                            required
                          />
                        </div>
                        <button type="submit" className={workspaceStyles.secondaryButton}>
                          Асуудал бүртгэх
                        </button>
                      </form>

                      {stop.issues.length ? (
                        <div className={fieldStyles.historyList}>
                          {stop.issues.map((issue) => (
                            <article key={issue.id} className={fieldStyles.historyCard}>
                              <strong>{issue.title}</strong>
                              <span>
                                {issue.typeLabel} / {issue.severityLabel}
                              </span>
                              <small>
                                {issue.stateLabel} / {issue.reportedAt}
                              </small>
                              <p>{issue.description}</p>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className={fieldStyles.helperText}>
                        Цэг хаагдсан, аюултай эсвэл дахин хянах шаардлагатай үед асуудлын бүртгэл ашиглана.
                        </p>
                      )}
                    </details>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
