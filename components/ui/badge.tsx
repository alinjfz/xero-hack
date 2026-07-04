import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
  {
    variants: {
      variant: {
        default: "bg-[color:var(--accent)] text-[color:var(--accent-foreground)]",
        subtle: "bg-white/8 text-[color:var(--muted-foreground)] ring-1 ring-white/12",
        success: "bg-emerald-400/18 text-emerald-100 ring-1 ring-emerald-300/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
