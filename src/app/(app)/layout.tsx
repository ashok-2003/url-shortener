import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";
import { LinkDetailSheet } from "@/features/links/ui/link-detail-sheet";

/**
 * The app shell for Home, My links and Analytics. The detail sheet (`?link=<slug>`) is
 * mounted once here so a row on any tab can open it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AppNav />
      <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-10 lg:px-8">
          {children}
        </div>
      </main>
      <Suspense>
        <LinkDetailSheet />
      </Suspense>
    </div>
  );
}
