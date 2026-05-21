"use client";

import { useId, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";

import styles from "@/app/workspace.module.css";

export type CleaningTeamMemberOption = {
  id: number;
  name: string;
  jobTitle: string;
  departmentName: string;
};

type TeamMemberPickerProps = {
  label: string;
  name?: string;
  options: CleaningTeamMemberOption[];
  defaultSelectedIds?: number[];
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

export function TeamMemberPicker({
  label,
  name = "member_ids",
  options,
  defaultSelectedIds = [],
}: TeamMemberPickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set(defaultSelectedIds));
  const normalizedQuery = normalizeSearch(query);
  const selectedOptions = options.filter((option) => selectedIds.has(option.id));
  const visibleOptions = useMemo(() => {
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      normalizeSearch(`${option.name} ${option.jobTitle} ${option.departmentName}`).includes(normalizedQuery),
    );
  }, [normalizedQuery, options]);

  function toggleMember(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearSelected() {
    setSelectedIds(new Set());
  }

  return (
    <div className={styles.teamMemberPicker}>
      <div className={styles.teamMemberPickerHeader}>
        <label htmlFor={inputId}>{label}</label>
        <span>{selectedIds.size} сонгосон</span>
      </div>

      <div className={styles.teamMemberSearch}>
        <Search aria-hidden />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Нэр, албан тушаалаар хайх"
        />
      </div>

      {selectedOptions.length ? (
        <div className={styles.teamMemberSelectedList} aria-label="Сонгосон гишүүд">
          {selectedOptions.map((option) => (
            <button key={option.id} type="button" onClick={() => toggleMember(option.id)}>
              <span>{option.name}</span>
              <X aria-hidden />
            </button>
          ))}
          <button type="button" className={styles.teamMemberClearButton} onClick={clearSelected}>
            Бүгдийг арилгах
          </button>
        </div>
      ) : null}

      <div className={styles.teamMemberOptionGrid}>
        {options.map((option) => {
          const checked = selectedIds.has(option.id);
          const isVisible = visibleOptions.some((visible) => visible.id === option.id);

          return (
            <label
              key={option.id}
              className={`${styles.teamMemberOption} ${checked ? styles.teamMemberOptionSelected : ""}`}
              style={{ display: isVisible ? undefined : "none" }}
            >
              <input
                type="checkbox"
                name={name}
                value={option.id}
                checked={checked}
                onChange={() => toggleMember(option.id)}
              />
              <span className={styles.teamMemberCheck} aria-hidden>
                {checked ? <Check /> : null}
              </span>
              <span className={styles.teamMemberText}>
                <strong>{option.name}</strong>
                <small>{[option.jobTitle, option.departmentName].filter(Boolean).join(" · ")}</small>
              </span>
            </label>
          );
        })}
      </div>

      {!visibleOptions.length ? <p className={styles.teamMemberEmpty}>Хайлтад тохирох ажилтан олдсонгүй.</p> : null}
    </div>
  );
}
