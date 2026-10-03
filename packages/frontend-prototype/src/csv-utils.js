// Escape text formulas without changing valid signed numeric measurements.
export function csvCell(value) {
  if (value === null || value === undefined) return '""';
  const raw = String(value);
  const safe = typeof value === "string" && /^[\s]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
