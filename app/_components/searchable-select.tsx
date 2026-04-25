"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "@/app/workspace.module.css";

export type SearchableSelectOption = {
  id: number;
  label: string;
  meta?: string;
  keywords?: string[];
};

type Props = {
  name: string;
  value: number | null;
  options: SearchableSelectOption[];
  placeholder: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyStateLabel?: string;
  onChange: (value: number | null) => void;
};

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

export function SearchableSelect({
  name,
  value,
  options,
  placeholder,
  disabled = false,
  searchPlaceholder = "Хайж шүүнэ үү",
  emptyStateLabel = "Тохирох сонголт олдсонгүй.",
  onChange,
}: Props) {
  const fieldId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const selectedOption = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(deferredQuery);
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const haystack = [
        option.label,
        option.meta ?? "",
        ...(option.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [deferredQuery, options]);

  useEffect(() => {
    const panelOpen = isOpen && !disabled;
    if (!panelOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [disabled, isOpen]);

  return (
    <div className={styles.searchableSelect} ref={wrapperRef}>
      <input type="hidden" name={name} value={value ? String(value) : ""} />

      <button
        id={fieldId}
        type="button"
        className={`${styles.searchableSelectButton} ${
          disabled ? styles.searchableSelectButtonDisabled : ""
        }`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${fieldId}-listbox`}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
      >
        <span className={styles.searchableSelectLabel}>
          {selectedOption?.label || placeholder}
        </span>
        <span className={styles.searchableSelectMeta}>
          {selectedOption?.meta || (disabled ? "Одоогоор сонгох боломжгүй" : "Хайж сонгоно")}
        </span>
      </button>

      {isOpen ? (
        <div className={styles.searchableSelectPanel}>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className={styles.searchableSelectSearch}
            autoFocus
          />

          <div
            id={`${fieldId}-listbox`}
            role="listbox"
            aria-labelledby={fieldId}
            className={styles.searchableSelectList}
          >
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  className={`${styles.searchableSelectOption} ${
                    option.id === value ? styles.searchableSelectOptionActive : ""
                  }`}
                  onClick={() => {
                    onChange(option.id);
                    setQuery("");
                    setIsOpen(false);
                  }}
                >
                  <span className={styles.searchableSelectOptionLabel}>{option.label}</span>
                  {option.meta ? (
                    <span className={styles.searchableSelectOptionMeta}>{option.meta}</span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className={styles.searchableSelectEmpty}>{emptyStateLabel}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
