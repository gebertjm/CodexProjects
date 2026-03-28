import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/modules/ui/cn";

export const Panel = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("panel", className)} {...props} />
);

export const PanelSoft = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("panel-soft", className)} {...props} />
);

export const Button = ({
  className,
  children,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
  <button
    className={cn(
      "inline-flex items-center justify-center rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold transition hover:border-forge-ember/60 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-forge-sky",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border border-forge-ember/30 bg-forge-ember/10 px-2.5 py-1 text-xs font-medium text-forge-mist",
      className,
    )}
    {...props}
  />
);
