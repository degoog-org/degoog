export const matchesWords = (
  fields: (string | undefined)[],
  q: string,
): boolean => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fields.filter(Boolean).join("\n").toLowerCase();
  return words.every((word) => haystack.includes(word));
};
