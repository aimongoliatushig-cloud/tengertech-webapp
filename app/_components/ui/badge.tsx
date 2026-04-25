import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type BadgeProps = ComponentProps<"span"> & {
  tone?: "green" | "amber" | "red" | "slate";
};

export function Badge({ className, tone = "green", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-2.5 text-[0.72rem] font-semibold tracking-[0.01em]",
        tone === "green" && "bg-[#A5D6A7]/35 text-[#2E7D32]",
        tone === "amber" && "bg-amber-100 text-amber-700",
        tone === "red" && "bg-red-100 text-red-700",
        tone === "slate" && "bg-slate-100 text-slate-600",
        className,
      )}
      {...props}
    />
  );
}
