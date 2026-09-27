/** Case-insensitive substring match; empty query yields no suggestions. */
export function filterComboOptions(options: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return options.filter((opt) => opt.toLowerCase().includes(q));
}
