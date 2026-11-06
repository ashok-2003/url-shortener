"use client";

export function LinkList() {
  return (
    <div>
      <h2 id="links-title" className="text-base leading-6 font-semibold">
        Your links
      </h2>
    </div>
  );
}

export function LinkListSkeleton() {
  return <div aria-hidden className="h-24 rounded-xl bg-surface" />;
}
