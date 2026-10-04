/* Shared by the groups directory and the home page (P1401), so a group looks the same on both. */
/** Initials tile for a group. Founder-approved (2026-08-28, "the initials
 *  tiles"). Two characters at most: a bare glyph reads as an avatar, three reads as
 *  a word. Decorative — the name beside it carries the accessible identity. */
export function OrgInitials({ name }: { name: string }) {
  const initials = name
    .replace(/^Clarity Practice Community[^A-Za-z0-9]*/i, "")
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700"
    >
      {initials || "C"}
    </div>
  );
}
