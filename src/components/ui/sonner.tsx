import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <>
      <style>{`
        [data-sonner-toaster][data-y-position="top"] {
          top: calc(3.5rem + env(safe-area-inset-top)) !important;
        }
        /* P1536: below 1280px the canvas owner bar is two rows (about 100px), so a toast at the usual place sits on its Clone and Share and blocks them for its whole time. While that bar
           is on the page the toaster starts 3.5rem lower, for every toast the page raises. From 1280px the bar is one row and the usual place is clear of it. */
        @media (max-width: 1279px) {
          body:has([data-owner-bar]) [data-sonner-toaster][data-y-position="top"] {
            top: calc(7rem + env(safe-area-inset-top)) !important;
          }
        }
      `}</style>
      <Sonner
        theme="light"
        position="top-center"
        duration={3000}
        closeButton
        visibleToasts={1}
        className="toaster group"
        toastOptions={{
          classNames: {
            toast:
              "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-md group-[.toaster]:py-2 group-[.toaster]:px-3 group-[.toaster]:text-sm",
            actionButton:
              "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
            cancelButton:
              "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          },
        }}
        {...props}
      />
    </>
  )
}

export { Toaster }
