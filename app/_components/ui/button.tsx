import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#66BB6A]",
        variant === "primary" &&
          "bg-[#2E7D32] text-white shadow-[0_18px_40px_rgba(46,125,50,0.24)] hover:bg-[#256d2a]",
        variant === "secondary" &&
          "border border-[#A5D6A7]/55 bg-white/70 text-[#2E7D32] shadow-sm hover:bg-[#F6FBF6]",
        variant === "ghost" && "bg-transparent text-[#2E7D32] hover:bg-[#A5D6A7]/20",
        className,
      )}
      {...props}
    />
  );
}
