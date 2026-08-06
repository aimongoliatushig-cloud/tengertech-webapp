"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ClipboardList, PlusCircle, Ruler } from "lucide-react";

import { SearchableSelect, type SearchableSelectOption } from "@/app/_components/searchable-select";
import styles from "@/app/workspace.module.css";
import type { SelectOption, WorkUnitOption } from "@/lib/workspace";
import { formatEmployeeMeta } from "@/lib/employee-label";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  projectId: number;
  taskId: number;
  taskName: string;
  teamLeaderId: number | null;
  crewTeamId: number | null;
  startDateValue: string;
  deadlineValue: string;
  plannedQuantity: number;
  measurementUnitId: number | null;
  description: string;
  canEditContent?: boolean;
  returnTo?: string;
  departmentUserOptions: SelectOption[];
  crewTeamOptions: Array<{
    id: number;
    label: string;
    memberUserIds?: number[];
  }>;
  unitOptions: WorkUnitOption[];
};

function buildUserOptions(users: SelectOption[]): SearchableSelectOption[] {
  return users.map((user) => ({
    id: user.id,
    label: user.name,
    meta: formatEmployeeMeta(user.jobTitle, user.departmentName),
    keywords: [
      user.name,
      user.jobTitle ?? "",
      user.phone ?? "",
      user.login,
      user.departmentName ?? "",
    ],
  }));
}

function buildUnitOptions(units: WorkUnitOption[]): SearchableSelectOption[] {
  return units.map((unit) => ({
    id: unit.id,
    label: unit.name,
    meta: [unit.code, unit.categoryLabel].filter(Boolean).join(" · "),
    keywords: [unit.name, unit.code, unit.categoryLabel],
  }));
}

export function ProjectTaskEditModal({
  action,
  projectId,
  taskId,
  taskName,
  teamLeaderId,
  crewTeamId,
  startDateValue,
  deadlineValue,
  plannedQuantity,
  measurementUnitId,
  description,
  canEditContent = true,
  returnTo,
  departmentUserOptions,
  crewTeamOptions,
  unitOptions,
}: Props) {
  const titleId = useId();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [editedTaskName, setEditedTaskName] = useState(taskName);
  const [selectedTeamLeaderId, setSelectedTeamLeaderId] = useState<number | null>(teamLeaderId);
  const [useTeam, setUseTeam] = useState(Boolean(crewTeamId));
  const [selectedCrewTeamId, setSelectedCrewTeamId] = useState(crewTeamId ? String(crewTeamId) : "");
  const [showNewTeamFields, setShowNewTeamFields] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [selectedNewTeamMemberIds, setSelectedNewTeamMemberIds] = useState<string[]>([]);
  const [teamMemberQuery, setTeamMemberQuery] = useState("");
  const [editedStartDate, setEditedStartDate] = useState(startDateValue);
  const [editedDeadline, setEditedDeadline] = useState(deadlineValue);
  const [useQuantity, setUseQuantity] = useState(plannedQuantity > 0 || Boolean(measurementUnitId));
  const [editedPlannedQuantity, setEditedPlannedQuantity] = useState(
    plannedQuantity > 0 ? String(plannedQuantity) : "",
  );
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(measurementUnitId);
  const [editedDescription, setEditedDescription] = useState(description);

  const assigneeOptions = useMemo(() => buildUserOptions(departmentUserOptions), [departmentUserOptions]);
  const measurementUnitOptions = useMemo(() => buildUnitOptions(unitOptions), [unitOptions]);
  const filteredTeamMembers = useMemo(() => {
    const normalizedQuery = teamMemberQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return departmentUserOptions;
    }

    return departmentUserOptions.filter((user) =>
      [
        user.name,
        user.jobTitle ?? "",
        user.phone ?? "",
        user.login,
        user.departmentName ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [departmentUserOptions, teamMemberQuery]);
  const selectedCrewTeamLabel =
    crewTeamOptions.find((team) => String(team.id) === selectedCrewTeamId)?.label ||
    (newTeamName.trim() ? `Шинэ баг: ${newTeamName.trim()}` : "Баг сонгоогүй");
  const selectedUnitLabel =
    measurementUnitOptions.find((unit) => unit.id === selectedUnitId)?.label || "Нэгж сонгоогүй";
  const selectedAssigneeLabel =
    assigneeOptions.find((user) => user.id === selectedTeamLeaderId)?.label || "Ажилтан сонгоогүй";
  const taskSteps = [
    { id: 1, label: "Мэдээлэл" },
    { id: 2, label: "Хэмжээ" },
    { id: 3, label: "Хянах" },
  ] as const;
  const visibleTaskSteps = canEditContent ? taskSteps : taskSteps.slice(0, 1);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const openModal = () => {
    setCurrentStep(1);
    setEditedTaskName(taskName);
    setSelectedTeamLeaderId(teamLeaderId);
    setUseTeam(Boolean(crewTeamId));
    setSelectedCrewTeamId(crewTeamId ? String(crewTeamId) : "");
    setShowNewTeamFields(false);
    setNewTeamName("");
    setSelectedNewTeamMemberIds([]);
    setTeamMemberQuery("");
    setEditedStartDate(startDateValue);
    setEditedDeadline(deadlineValue);
    setUseQuantity(plannedQuantity > 0 || Boolean(measurementUnitId));
    setEditedPlannedQuantity(plannedQuantity > 0 ? String(plannedQuantity) : "");
    setSelectedUnitId(measurementUnitId);
    setEditedDescription(description);
    setIsOpen(true);
  };

  const toggleNewTeamMember = (memberId: string, checked: boolean) => {
    setSelectedNewTeamMemberIds((current) => {
      if (checked) {
        return current.includes(memberId) ? current : [...current, memberId];
      }

      return current.filter((item) => item !== memberId);
    });
  };

  const portalTarget = isMounted ? document.body : null;
  const modalContent =
    portalTarget && isOpen
      ? createPortal(
          <div
            className={styles.modalOverlay}
            role="presentation"
            onClick={() => setIsOpen(false)}
          >
            <div
              className={`${styles.modalDialog} ${styles.taskCreateModalDialog} ${styles.taskEditModalDialog}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <button
                  type="button"
                  className={styles.modalCloseButton}
                  aria-label="Цонх хаах"
                  onClick={() => setIsOpen(false)}
                >
                  ←
                </button>
                <div className={styles.modalTitleGroup}>
                  <strong className={styles.modalTitle} id={titleId}>
                    {canEditContent ? "Даалгавар засах" : "Баг хуваарилах"}
                  </strong>
                </div>
              </div>

              <form action={action} className={styles.modalForm}>
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="task_id" value={taskId} />
                {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
                <input type="hidden" name="task_assignment_mode" value={useTeam ? "team" : "single"} />

                {canEditContent ? (
                <div className={styles.taskCreateStepper} aria-label="Даалгавар засах алхам">
                  {visibleTaskSteps.map((step) => (
                    <button
                      key={step.id}
                      type="button"
                      className={currentStep === step.id ? styles.taskCreateStepDotActive : ""}
                      onClick={() => setCurrentStep(step.id)}
                      aria-current={currentStep === step.id ? "step" : undefined}
                    >
                      <span>{step.id}</span>
                      <small>{step.label}</small>
                    </button>
                  ))}
                </div>
                ) : null}

                <section className={`${styles.taskCreateStepPanel} ${currentStep === 1 ? styles.taskCreateStepActive : ""}`}>
                  <div className={styles.taskCreateSectionHeader}>
                    <ClipboardList aria-hidden />
                    <div>
                      <strong>Даалгаврын үндсэн мэдээлэл</strong>
                      <p>
                        {canEditContent
                          ? "Даалгаврын нэр, дугаар болон хариуцсан ажилтан эсвэл багийг шинэчилнэ."
                          : "Дээрээс ирсэн даалгаврын агуулгыг өөрчлөхгүйгээр зөвхөн хариуцсан ажилтан эсвэл баг хуваарилна."}
                      </p>
                    </div>
                  </div>

                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label>Одоогийн даалгавар</label>
                      <div className={styles.lockedFieldValue}>{taskName}</div>
                    </div>

                    <div className={styles.field}>
                      <label>Даалгаврын дугаар</label>
                      <div className={styles.lockedFieldValue}>#{taskId}</div>
                    </div>
                  </div>

                  {canEditContent ? (
                  <div className={styles.field}>
                    <label htmlFor="edit-task-name">Даалгаврын нэр</label>
                    <input
                      id="edit-task-name"
                      name="name"
                      value={editedTaskName}
                      onChange={(event) => setEditedTaskName(event.target.value)}
                      required
                    />
                  </div>
                  ) : null}

                  <section className={styles.assignmentPanel}>
                    <div className={styles.field}>
                      <label>Хариуцсан ажилтан</label>
                      <SearchableSelect
                        name="team_leader_id"
                        value={selectedTeamLeaderId}
                        options={assigneeOptions}
                        placeholder="Хариуцсан ажилтан сонгоно уу"
                        disabled={!assigneeOptions.length}
                        searchPlaceholder="Нэр эсвэл утсаар хайна уу"
                        emptyStateLabel="Энэ хэлтэст бүртгэлтэй хэрэглэгч алга."
                        onChange={setSelectedTeamLeaderId}
                      />
                    </div>

                    <label className={styles.teamToggleRow}>
                      <input
                        type="checkbox"
                        checked={useTeam}
                        onChange={(event) => setUseTeam(event.target.checked)}
                      />
                      <span>Багаар хийх</span>
                    </label>

                    {useTeam ? (
                      <div className={styles.teamAssignmentPanel}>
                        <div className={styles.field}>
                          <label htmlFor="edit-task-crew-team">Баг сонгох</label>
                          <select
                            id="edit-task-crew-team"
                            name="crew_team_id"
                            value={selectedCrewTeamId}
                            onChange={(event) => setSelectedCrewTeamId(event.target.value)}
                            disabled={!crewTeamOptions.length}
                          >
                            <option value="">
                              {crewTeamOptions.length ? "Баг сонгохгүй" : "Энэ хэлтэст бүртгэлтэй баг алга"}
                            </option>
                            {crewTeamOptions.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          className={styles.teamCreateButton}
                          onClick={() => {
                            setShowNewTeamFields((current) => !current);
                            setSelectedCrewTeamId("");
                          }}
                          aria-expanded={showNewTeamFields}
                        >
                          <PlusCircle aria-hidden />
                          <span>{showNewTeamFields ? "Шинэ багийг хаах" : "Шинэ баг нэмэх"}</span>
                        </button>

                        {showNewTeamFields ? (
                          <div className={styles.inlineTeamPanel}>
                            {selectedNewTeamMemberIds.map((memberId) => (
                              <input
                                key={memberId}
                                type="hidden"
                                name="new_crew_member_user_ids"
                                value={memberId}
                              />
                            ))}
                            <label>
                              <span>Багийн нэр</span>
                              <input
                                name="new_crew_team_name"
                                placeholder="Жишээ: Ногоон байгууламжийн баг 01"
                                value={newTeamName}
                                onChange={(event) => setNewTeamName(event.target.value)}
                              />
                            </label>
                            <fieldset>
                              <legend>Багийн гишүүд</legend>
                              <input
                                type="search"
                                value={teamMemberQuery}
                                onChange={(event) => setTeamMemberQuery(event.target.value)}
                                placeholder="Нэр, албан тушаал эсвэл утсаар хайх"
                                className={styles.inlineMemberSearch}
                              />
                              <div className={styles.inlineMemberList}>
                                {filteredTeamMembers.length ? (
                                  filteredTeamMembers.map((user) => (
                                    <label key={user.id}>
                                      <input
                                        type="checkbox"
                                        value={user.id}
                                        checked={selectedNewTeamMemberIds.includes(String(user.id))}
                                        onChange={(event) =>
                                          toggleNewTeamMember(String(user.id), event.target.checked)
                                        }
                                      />
                                      <span>
                                        <strong>{user.name}</strong>
                                        <small>
                                          {[user.jobTitle, user.phone || user.login]
                                            .filter(Boolean)
                                            .join(" · ") || "Албан тушаал бүртгэлгүй"}
                                        </small>
                                      </span>
                                    </label>
                                  ))
                                ) : (
                                  <p>Тохирох ажилтан олдсонгүй.</p>
                                )}
                              </div>
                            </fieldset>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  <div className={styles.taskCreateStepActions}>
                    {canEditContent ? (
                      <button type="button" className={styles.primaryButton} onClick={() => setCurrentStep(2)}>
                        Хэмжээ ба огноо руу шилжих
                      </button>
                    ) : (
                      <button type="submit" className={styles.primaryButton}>
                        Баг хуваарилах
                      </button>
                    )}
                  </div>
                </section>

                {canEditContent ? (
                <section className={`${styles.taskCreateStepPanel} ${currentStep === 2 ? styles.taskCreateStepActive : ""}`}>
                  <div className={styles.taskCreateSectionHeader}>
                    <Ruler aria-hidden />
                    <div>
                      <strong>Хэмжээ ба хугацаа</strong>
                      <p>Эхлэх, дуусах огноо, хэмжих нэгж болон товч тайлбарыг шинэчилнэ.</p>
                    </div>
                  </div>

                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor="edit-task-start-date">Эхлэх огноо</label>
                      <input
                        id="edit-task-start-date"
                        name="start_date"
                        type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10}
                        value={editedStartDate}
                        onChange={(event) => setEditedStartDate(event.target.value)}
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="edit-task-deadline">Дуусах огноо</label>
                      <input
                        id="edit-task-deadline"
                        name="deadline"
                        type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10}
                        value={editedDeadline}
                        onChange={(event) => setEditedDeadline(event.target.value)}
                      />
                    </div>
                  </div>

                  <label className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={useQuantity}
                      onChange={(event) => setUseQuantity(event.target.checked)}
                    />
                    <span>Хэмжээ ашиглах</span>
                  </label>

                  {useQuantity ? (
                    <div className={styles.quantityRows}>
                      <div className={styles.quantityRow}>
                        <div className={styles.field}>
                          <label htmlFor="edit-task-planned-quantity">Тоо хэмжээ</label>
                          <input
                            id="edit-task-planned-quantity"
                            name="planned_quantity"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={editedPlannedQuantity}
                            onChange={(event) => setEditedPlannedQuantity(event.target.value)}
                          />
                        </div>

                        <div className={styles.field}>
                          <label>Хэмжих нэгж</label>
                          <SearchableSelect
                            name="unit_id"
                            value={selectedUnitId}
                            options={measurementUnitOptions}
                            placeholder="Хэмжих нэгж сонгоно уу"
                            disabled={!measurementUnitOptions.length}
                            searchPlaceholder="Нэгж хайна уу"
                            emptyStateLabel="Тохирох хэмжих нэгж алга."
                            onChange={setSelectedUnitId}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.field}>
                    <label htmlFor="edit-task-description">Товч тайлбар</label>
                    <textarea
                      id="edit-task-description"
                      name="description"
                      value={editedDescription}
                      onChange={(event) => setEditedDescription(event.target.value)}
                    />
                  </div>

                  <div className={styles.taskCreateStepActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setCurrentStep(1)}>
                      Үндсэн мэдээлэл рүү буцах
                    </button>
                    <button type="button" className={styles.primaryButton} onClick={() => setCurrentStep(3)}>
                      Хянаж хадгалах рүү шилжих
                    </button>
                  </div>
                </section>
                ) : null}

                {canEditContent ? (
                <section className={`${styles.taskCreateStepPanel} ${currentStep === 3 ? styles.taskCreateStepActive : ""}`}>
                  <div className={styles.taskCreateSectionHeader}>
                    <CheckCircle2 aria-hidden />
                    <div>
                      <strong>Хянах ба хадгалах</strong>
                      <p>Өөрчлөлтөө шалгаад даалгаврыг хадгална уу.</p>
                    </div>
                  </div>

                  <div className={styles.taskCreateSummaryGrid}>
                    <article className={styles.taskCreateSummaryCard}>
                      <div>
                        <strong>Үндсэн мэдээлэл</strong>
                        <button type="button" onClick={() => setCurrentStep(1)}>Үндсэн мэдээлэл засах</button>
                      </div>
                      <dl>
                        <dt>Даалгавар</dt>
                        <dd>{editedTaskName.trim() || "Оруулаагүй"}</dd>
                        <dt>Даалгаврын дугаар</dt>
                        <dd>#{taskId}</dd>
                        <dt>Хуваарилалт</dt>
                        <dd>{useTeam ? selectedCrewTeamLabel : selectedAssigneeLabel}</dd>
                      </dl>
                    </article>

                    <article className={styles.taskCreateSummaryCard}>
                      <div>
                        <strong>Хэмжээ ба огноо</strong>
                        <button type="button" onClick={() => setCurrentStep(2)}>Хэмжээ ба огноо засах</button>
                      </div>
                      <dl>
                        <dt>Эхлэх огноо</dt>
                        <dd>{editedStartDate || "Оруулаагүй"}</dd>
                        <dt>Дуусах огноо</dt>
                        <dd>{editedDeadline || "Оруулаагүй"}</dd>
                        <dt>Хэмжих нэгж</dt>
                        <dd>{useQuantity ? selectedUnitLabel : "Ашиглахгүй"}</dd>
                        <dt>Тоо хэмжээ</dt>
                        <dd>{useQuantity ? editedPlannedQuantity || "Оруулаагүй" : "Ашиглахгүй"}</dd>
                      </dl>
                    </article>

                    <article className={styles.taskCreateSummaryCard}>
                      <div>
                        <strong>Тайлбар</strong>
                        <button type="button" onClick={() => setCurrentStep(2)}>Тайлбар засах</button>
                      </div>
                      <dl>
                        <dt>Товч тайлбар</dt>
                        <dd>{editedDescription.trim() || "Оруулаагүй"}</dd>
                      </dl>
                    </article>
                  </div>

                  <div className={styles.taskCreateReadyCard}>
                    <CheckCircle2 aria-hidden />
                    <div>
                      <strong>Хадгалахад бэлэн</strong>
                      <span>Даалгаврын өөрчлөлтүүдийг хадгална.</span>
                    </div>
                  </div>

                  <div className={`${styles.modalActions} ${styles.taskCreateFinalActions}`}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setCurrentStep(2)}>
                      Хэмжээ ба огноо руу буцах
                    </button>
                    <button type="submit" className={styles.primaryButton}>
                      Даалгаврын өөрчлөлт хадгалах
                    </button>
                  </div>
                </section>
                ) : null}
              </form>
            </div>
          </div>,
          portalTarget,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={openModal}
      >
        {canEditContent ? "Даалгавар засах" : "Баг хуваарилах"}
      </button>
      {modalContent}
    </>
  );
}
