"use client";

import { Toaster } from "@/components/ui/sonner";
import { useMediaQuery } from "@/hooks/use-media-query";

export function AppToaster() {
  const desktop = useMediaQuery("(min-width: 768px)");
  return <Toaster position={desktop ? "bottom-right" : "bottom-center"} />;
}
