"use client";

import { Share2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";

export function ShareButton({ url, title }: { url: string; title?: string }) {
  const hydrated = useHydrated();
  if (!hydrated || typeof navigator.share !== "function") return null;

  async function share() {
    try {
      await navigator.share({ url, title });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn't open the share sheet. Copy the link instead.");
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={share}>
      <Share2Icon aria-hidden />
      Share
    </Button>
  );
}
