import * as React from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function GlassCard({ className, hover = true, children, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/90 bg-white/85 backdrop-blur-sm shadow-sm",
        "transition-all duration-300",
        hover && "hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
