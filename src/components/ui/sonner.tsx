"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Light only: no theme provider. Success has no icon colour or green (DESIGN.md).
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "min(356px, calc(100vw - 32px))",
        } as React.CSSProperties
      }
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: "cn-toast !shadow-[var(--shadow-overlay)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
