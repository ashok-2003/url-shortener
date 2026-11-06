import { brand } from "@/config/brand";

export function AppHeader() {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[24px] leading-[30px] font-medium tracking-[-0.01em] md:text-[30px] md:leading-[36px]">
          {brand.name}
        </h1>
        <p className="text-xs leading-4 tracking-[0.01em] text-ink-muted">
          {brand.description}
        </p>
      </div>
      <span className="font-mono text-sm leading-5 tabular-nums text-ink-muted">
        user_demo
      </span>
    </header>
  );
}
