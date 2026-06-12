"use client";

import { useEffect } from "react";

import { UI_CONTEXT_FIELD } from "@/lib/ui-context";

function currentContextPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function upsertHidden(form: HTMLFormElement, name: string, value: string) {
  const existing = form.querySelector<HTMLInputElement>(
    `input[type="hidden"][name="${CSS.escape(name)}"]`,
  );

  if (existing) {
    existing.value = value;
    return;
  }

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  form.appendChild(input);
}

export function UiContextPreserver() {
  useEffect(() => {
    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const method = (form.getAttribute("method") || "post").toLocaleLowerCase("en-US");
      if (method === "get") {
        return;
      }

      const contextPath = currentContextPath();
      upsertHidden(form, UI_CONTEXT_FIELD, contextPath);

      if (!form.elements.namedItem("redirect_path")) {
        upsertHidden(form, "redirect_path", contextPath);
      }
      if (!form.elements.namedItem("returnTo")) {
        upsertHidden(form, "returnTo", contextPath);
      }
    };

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, []);

  return null;
}
