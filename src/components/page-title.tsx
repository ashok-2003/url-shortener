/** The one `h1` per tab, in the display face (DESIGN.md: Garamond for the page title only). */
export function PageTitle({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h1
        id="page-title"
        className="font-display text-[24px] leading-[30px] font-medium tracking-[-0.01em] text-balance md:text-[30px] md:leading-[36px]"
      >
        {children}
      </h1>
      {caption ? <p className="text-sm text-ink-muted">{caption}</p> : null}
    </header>
  );
}
