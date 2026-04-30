"use client";

import { useMemo, useState } from "react";

import styles from "./garbage-settings.module.css";

type TeamMemberOption = {
  id: number;
  label: string;
};

type VehicleOption = {
  id: number;
  label: string;
};

type TeamCreateFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  memberOptions: TeamMemberOption[];
  vehicles: VehicleOption[];
};

function splitEmployeeLabel(label: string) {
  const match = label.match(/^(.*?)\s*\((.*)\)$/);
  return {
    name: match?.[1]?.trim() || label,
    meta: match?.[2]?.trim() || "",
  };
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase("mn-MN").trim();
}

export function TeamCreateForm({ action, memberOptions, vehicles }: TeamCreateFormProps) {
  const [query, setQuery] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

  const selectedIdSet = useMemo(() => new Set(selectedMemberIds), [selectedMemberIds]);
  const selectedMembers = useMemo(
    () => memberOptions.filter((employee) => selectedIdSet.has(employee.id)),
    [memberOptions, selectedIdSet],
  );
  const filteredMembers = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return memberOptions;
    }

    return memberOptions.filter((employee) =>
      normalizeSearchText(employee.label).includes(normalizedQuery),
    );
  }, [memberOptions, query]);

  const toggleMember = (memberId: number) => {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  };

  const removeMember = (memberId: number) => {
    setSelectedMemberIds((current) => current.filter((id) => id !== memberId));
  };

  return (
    <form action={action} className={`${styles.formPanel} ${styles.teamCreatePanel}`}>
      {selectedMemberIds.map((memberId) => (
        <input key={memberId} type="hidden" name="member_ids" value={memberId} />
      ))}

      <div className={styles.formPanelHeader}>
        <div>
          <span className={styles.eyebrow}>Баг нэмэх</span>
          <strong>Шинэ хог тээврийн баг</strong>
        </div>
        <span className={styles.countPill}>{selectedMemberIds.length} сонгосон</span>
      </div>

      <div className={styles.teamQuickFields}>
        <label className={styles.field}>
          <span>Багийн нэр</span>
          <input name="team_name" placeholder="Жишээ: Хог тээврийн экипаж 01" required />
        </label>
        <label className={styles.field}>
          <span>Багийн ахлагч / мастер</span>
          <select name="team_leader_id" defaultValue="">
            <option value="">Сонгохгүй</option>
            {memberOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Багийн машин</span>
          <select name="team_vehicle_id" defaultValue="">
            <option value="">Машин сонгохгүй</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Хариуцах хороо / бүс</span>
          <input name="service_area" placeholder="Жишээ: 8, 9-р хороо" />
        </label>
      </div>

      <fieldset className={styles.memberPicker}>
        <legend>Багийн ажилчид</legend>
        <div className={styles.memberToolbar}>
          <label className={styles.field}>
            <span>Ажилтан хайх</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Нэр, албан тушаал, хэлтэс"
            />
          </label>
          <div className={styles.selectedMembers} aria-live="polite">
            {selectedMembers.length ? (
              selectedMembers.slice(0, 6).map((employee) => {
                const employeeLabel = splitEmployeeLabel(employee.label);
                return (
                  <button
                    key={employee.id}
                    type="button"
                    className={styles.selectedChip}
                    onClick={() => removeMember(employee.id)}
                  >
                    {employeeLabel.name}
                    <span aria-hidden>×</span>
                  </button>
                );
              })
            ) : (
              <span className={styles.selectedPlaceholder}>Ажилтан сонгоогүй</span>
            )}
            {selectedMembers.length > 6 ? (
              <span className={styles.selectedPlaceholder}>+{selectedMembers.length - 6}</span>
            ) : null}
          </div>
        </div>

        {filteredMembers.length ? (
          <div className={styles.memberGrid}>
            {filteredMembers.map((employee) => {
              const employeeLabel = splitEmployeeLabel(employee.label);
              const checked = selectedIdSet.has(employee.id);
              return (
                <label key={employee.id} className={styles.memberOption}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMember(employee.id)}
                  />
                  <span>
                    <strong>{employeeLabel.name}</strong>
                    {employeeLabel.meta ? <small>{employeeLabel.meta}</small> : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyState}>Хайлтанд тохирох ажилтан алга.</p>
        )}
      </fieldset>

      <button type="submit" className={styles.primaryButton}>Баг нэмэх</button>
    </form>
  );
}
