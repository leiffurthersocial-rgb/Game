import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "secondary" | "outline" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide",
        variant === "default" && "bg-white text-black",
        variant === "secondary" && "bg-white/10 text-white",
        variant === "outline" && "border border-white/15 text-white/80",
        variant === "accent" && "bg-emerald-400 text-black",
        className
      )}
      {...props}
    />
  );
}
