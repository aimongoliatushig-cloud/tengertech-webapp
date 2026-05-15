"use client";

import { useMemo, useState } from "react";

import type { ProcurementMeta } from "@/lib/procurement";

import styles from "../procurement.module.css";

type RelationType = "project" | "vehicle";

type ProcurementRelationFieldsProps = {
  projects: ProcurementMeta["projects"];
  tasks: ProcurementMeta["tasks"];
  vehicles: ProcurementMeta["vehicles"];
  selectedProjectId?: string;
  selectedTaskId?: string;
  selectedVehicleId?: string;
  defaultType?: RelationType;
};

export function ProcurementRelationFields({
  projects,
  tasks,
  vehicles,
  selectedProjectId = "",
  selectedTaskId = "",
  selectedVehicleId = "",
  defaultType = "project",
}: ProcurementRelationFieldsProps) {
  const [relationType, setRelationType] = useState<RelationType>(defaultType);
  const [projectId, setProjectId] = useState(selectedProjectId);
  const projectMode = relationType === "project";
  const vehicleMode = relationType === "vehicle";
  const filteredTasks = useMemo(
    () =>
      projectId
        ? tasks.filter((task) => String(task.project_id) === String(projectId))
        : tasks,
    [projectId, tasks],
  );

  return (
    <div className={styles.formStack}>
      <div className={styles.fieldSpanFull}>
        <span className={styles.fieldTitle}>Худалдан авалтын төрөл</span>
        <div className={styles.segmentedControl} role="radiogroup" aria-label="Худалдан авалтын төрөл">
          <label className={relationType === "project" ? styles.segmentActive : ""}>
            <input
              type="radio"
              name="relation_type"
              value="project"
              checked={relationType === "project"}
              onChange={() => setRelationType("project")}
            />
            <span>Төсөлтэй холбоотой</span>
          </label>
          <label className={relationType === "vehicle" ? styles.segmentActive : ""}>
            <input
              type="radio"
              name="relation_type"
              value="vehicle"
              checked={relationType === "vehicle"}
              onChange={() => setRelationType("vehicle")}
            />
            <span>Машин / засвартай холбоотой</span>
          </label>
        </div>
      </div>

      {projectMode ? (
        <div className={styles.formGrid}>
          <label className={styles.fieldLabel}>
            Төсөл
            <select
              name="project_id"
              value={projectId}
              onChange={(event) => setProjectId(event.currentTarget.value)}
            >
              <option value="">Сонгох</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Даалгавар
            <select name="task_id" defaultValue={selectedTaskId}>
              <option value="">Сонгох</option>
              {filteredTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {vehicleMode ? (
        <div className={styles.formGrid}>
          <label className={styles.fieldLabel}>
            Авто тээвэр
            <select name="vehicle_id" defaultValue={selectedVehicleId} required={vehicleMode}>
              <option value="">Сонгох</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Засварын хэрэгцээ
            <textarea
              name="repair_need"
              placeholder="Солих эд анги, засварын шалтгаан, техникийн хэрэгцээг бичнэ үү."
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
