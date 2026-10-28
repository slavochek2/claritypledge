import type { ComponentPropsWithoutRef, ElementType } from "react"
import { cn } from "@/lib/utils"

type SkeletonProps = ComponentPropsWithoutRef<"div"> & {
  /** `span` for a skeleton that sits inside running text (a `div` there is invalid HTML). */
  as?: Extract<ElementType, "div" | "span">
}

/**
 * P1586: the one grey placeholder block every skeleton is drawn from: one colour, one pulse,
 * one default radius. It adds no layout, so the caller's className owns size and shape
 * (`h-4 w-1/3`, `rounded-full`); twMerge lets a className radius or colour replace the default.
 *
 * Decorative, so hidden from assistive tech; the page loader or the list's own label says what
 * is loading. A caller that gives it a `role` (e.g. `status` + `aria-label`) keeps it announced.
 */
function Skeleton({ as: Tag = "div", className, role, ...props }: SkeletonProps) {
  return (
    <Tag
      aria-hidden={role ? undefined : true}
      role={role}
      className={cn("animate-pulse rounded bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
