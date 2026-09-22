import type { Child } from "../../tribute/types";

const PLACEHOLDER = /\{([a-zA-Z][\w-]*)\}/g;

export const TransText = ({
  text,
  slots,
}: {
  text: string;
  slots: Record<string, Child>;
}): JSX.Element => {
  const parts: Child[] = [];
  let at = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    const start = match.index;
    const slot = slots[match[1]];
    if (slot === undefined) continue;
    if (start > at) parts.push(text.slice(at, start));
    parts.push(slot);
    at = start + match[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
};
