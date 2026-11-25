/** Allow only same-site paths and http(s) links. Blocks javascript: and data:. */
export function safeNotificationHref(link: string | null | undefined): string {
  if (!link) return "#";
  const value = link.trim();
  if (!value || value.startsWith("//")) return "#";
  if (value.startsWith("/") && !/^\/\\/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return "#";
  }
  return "#";
}
