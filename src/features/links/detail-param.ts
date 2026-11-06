export const DETAIL_PARAM = "link";

export function detailHref(slug: string): string {
  return `?${DETAIL_PARAM}=${encodeURIComponent(slug)}`;
}
