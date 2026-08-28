import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

// Hook to detect mobile (client-side only)
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const check = () => {
      // Check for touch capability and screen width
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isNarrow = window.innerWidth < 768
      setIsMobile(hasTouch && isNarrow)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return isMobile
}

// Context to share open state and mobile detection
/**
 * P1179: `forceSheet` pins the simple portal branch at EVERY width instead of
 * switching to vaul above the mobile breakpoint.
 *
 * Why it exists: the vaul branch never opens for a controlled `open` with no
 * `DrawerTrigger` inside the Root — the trigger lives in the nav's right-hand
 * group, outside the drawer. Every existing consumer of this component is
 * mobile-only in practice, so that branch was never exercised and the bug was
 * invisible (epistemic.md 7b: green bounds what was modelled). Caught by
 * e2e/p1179-links-navigation.spec.ts at the default desktop viewport, where the
 * button rendered, reported itself active, and no sheet ever appeared.
 *
 * Opt-in on purpose: no existing consumer changes behaviour.
 */
const DrawerContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobile: boolean
  dismissible: boolean
}>({
  open: false,
  onOpenChange: () => {},
  isMobile: false,
  dismissible: true,
})

const Drawer = ({
  shouldScaleBackground = false,
  open,
  onOpenChange,
  dismissible = true,
  forceSheet = false,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & { dismissible?: boolean; forceSheet?: boolean }) => {
  const isMobile = useIsMobile() || forceSheet
  const [internalOpen, setInternalOpen] = React.useState(open ?? false)

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange : setInternalOpen

  // Mobile: use simple portal-based drawer
  if (isMobile) {
    return (
      <DrawerContext.Provider value={{ open: isOpen ?? false, onOpenChange: setIsOpen ?? (() => {}), isMobile: true, dismissible }}>
        {children}
      </DrawerContext.Provider>
    )
  }

  // Desktop: use Vaul
  return (
    <DrawerContext.Provider value={{ open: isOpen ?? false, onOpenChange: setIsOpen ?? (() => {}), isMobile: false, dismissible }}>
      <DrawerPrimitive.Root
        shouldScaleBackground={shouldScaleBackground}
        open={open}
        onOpenChange={onOpenChange}
        dismissible={dismissible}
        {...props}
      >
        {children}
      </DrawerPrimitive.Root>
    </DrawerContext.Provider>
  )
}
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props}
  />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { overlayClassName?: string }
>(({ className, children, overlayClassName, ...props }, ref) => {
  const { open, onOpenChange, isMobile, dismissible } = React.useContext(DrawerContext)

  // Mobile: render a simple fixed-position div with portal
  if (isMobile) {
    if (!open) return null

    return createPortal(
      <>
        {/* Overlay - only dismissible if dismissible prop is true */}
        <div
          role="presentation"
          className={cn(
            overlayClassName ?? "fixed inset-0 z-50 bg-black/80 animate-in fade-in-0",
          )}
          onClick={dismissible ? () => onOpenChange(false) : undefined}
        />
        {/* Drawer content */}
        <div
          ref={ref}
          className={cn(
            // P956: pb-[env(safe-area-inset-bottom)] keeps drawer content above the
            // system bar on edge-to-edge (viewport-fit=cover); resolves to 0 elsewhere.
            "fixed inset-x-0 bottom-0 z-50 flex h-auto flex-col rounded-t-[10px] border bg-background pb-[env(safe-area-inset-bottom)]",
            "animate-in slide-in-from-bottom duration-300",
            className
          )}
          {...props}
        >
          {/* Only show drag handle if dismissible */}
          {dismissible && <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />}
          {children}
        </div>
      </>,
      document.body
    )
  }

  // Desktop: use Vaul's DrawerContent
  return (
    <DrawerPortal>
      <DrawerOverlay className={overlayClassName} />
      <DrawerPrimitive.Content
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background pb-[env(safe-area-inset-bottom)]",
          className
        )}
        {...props}
      >
        {/* Only show drag handle if dismissible */}
        {dismissible && <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
})
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  const { isMobile } = React.useContext(DrawerContext)

  if (isMobile) {
    return (
      // eslint-disable-next-line jsx-a11y/heading-has-content
      <h2
        ref={ref}
        className={cn(
          "text-lg font-semibold leading-none tracking-tight",
          className
        )}
        {...props}
      />
    )
  }

  return (
    <DrawerPrimitive.Title
      ref={ref}
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  )
})
DrawerTitle.displayName = "DrawerTitle"

const DrawerDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { isMobile } = React.useContext(DrawerContext)

  if (isMobile) {
    return (
      <p
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
      />
    )
  }

  return (
    <DrawerPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
DrawerDescription.displayName = "DrawerDescription"

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
