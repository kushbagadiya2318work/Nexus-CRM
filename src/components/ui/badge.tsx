import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "error" | "info"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80": variant === "default",
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
          "border-border bg-background hover:bg-secondary hover:text-secondary-foreground": variant === "outline",
          "border-transparent bg-success text-white hover:bg-success/80": variant === "success",
          "border-transparent bg-warning text-white hover:bg-warning/80": variant === "warning",
          "border-transparent bg-error text-white hover:bg-error/80": variant === "error",
          "border-transparent bg-info text-white hover:bg-info/80": variant === "info",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
