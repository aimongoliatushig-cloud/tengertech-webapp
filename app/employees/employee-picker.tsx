"use client";

import { useMemo, useState } from "react";

import styles from "./employees.module.css";

type Option = { id: number; name: string };

export function EmployeePicker({
  options,
  name = "team_leader_id",
}: {
  options: Option[];
  name?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Option | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("mn-MN");
    const base = normalized
      ? options.filter((option) =>
          option.name.toLocaleLowerCase("mn-MN").includes(normalized),
        )
      : options;
    return base.slice(0, 40);
  }, [options, query]);

  const handleBlur = () => {
    window.setTimeout(() => {
      setOpen(false);
      if (!selected) {
        const exact = options.find(
          (option) =>
            option.name.toLocaleLowerCase("mn-MN") ===
            query.trim().toLocaleLowerCase("mn-MN"),
        );
        if (exact) {
          setSelected(exact);
          setQuery(exact.name);
        }
      }
    }, 150);
  };

  return (
    <div className={styles.picker}>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <input
        className={styles.pickerInput}
        placeholder="Нэрээр хайх..."
        value={query}
        required
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
      />
      {open ? (
        <ul className={styles.pickerList}>
          {filtered.length ? (
            filtered.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className={styles.pickerItem}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setSelected(option);
                    setQuery(option.name);
                    setOpen(false);
                  }}
                >
                  {option.name}
                </button>
              </li>
            ))
          ) : (
            <li className={styles.pickerEmpty}>Ажилтан олдсонгүй</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
