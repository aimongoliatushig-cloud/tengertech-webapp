"use client";

type GarbageVehicleSelectOption = {
  key: string;
  label: string;
  detail: string;
};

type GarbageVehicleSelectProps = {
  name: string;
  value: string;
  options: GarbageVehicleSelectOption[];
  emptyLabel: string;
};

export function GarbageVehicleSelect({
  name,
  value,
  options,
  emptyLabel,
}: GarbageVehicleSelectProps) {
  function handleChange(nextValue: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("report", "garbage");
    if (nextValue) {
      params.set("vehicle", nextValue);
    } else {
      params.delete("vehicle");
    }
    window.location.href = `/reports?${params.toString()}`;
  }

  return (
    <select
      name={name}
      value={value}
      onChange={(event) => handleChange(event.currentTarget.value)}
    >
      {options.length ? (
        options.map((vehicle) => (
          <option key={vehicle.key} value={vehicle.key}>
            {vehicle.label} {vehicle.detail ? `(${vehicle.detail})` : ""}
          </option>
        ))
      ) : (
        <option value="">{emptyLabel}</option>
      )}
    </select>
  );
}
