import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  className
}: {
  name: string;
  className?: string;
}) {
  return (
    <div className={cn("grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/10 text-xs font-semibold text-white", className)}>
      {initials(name)}
    </div>
  );
}
