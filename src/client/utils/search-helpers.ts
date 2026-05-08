import type { Command } from "../types";

export function runScriptsInContainer(container: HTMLElement | null): void {
  if (!container) return;
  container.querySelectorAll("script").forEach((oldScript) => {
    const script = document.createElement("script");
    script.textContent = oldScript.textContent;
    container.appendChild(script);
  });
}

export function setResultsMeta(metaText: string): void {
  const el = document.getElementById("results-meta");
  if (!el) return;
  el.textContent = metaText;
}

export const getNaturalLanguageBangQuery = (
  query: string,
  commands: Command[],
): string | null => {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const withNatural = commands.filter((c) => c.naturalLanguage && c.id);
  const firstWordMap = new Map<string, string>();
  const phraseList: Array<{ phrase: string; trigger: string }> = [];
  for (const c of withNatural) {
    const trigger = c.trigger.toLowerCase();
    firstWordMap.set(trigger, c.trigger);
    for (const a of c.aliases || [])
      firstWordMap.set(a.toLowerCase(), c.trigger);
    for (const p of c.naturalLanguagePhrases || []) {
      phraseList.push({ phrase: p.toLowerCase(), trigger: c.trigger });
    }
  }
  phraseList.sort((a, b) => b.phrase.length - a.phrase.length);
  for (const { phrase, trigger } of phraseList) {
    if (lower === phrase || lower.startsWith(phrase + " ")) {
      const rest = trimmed.slice(phrase.length).trim();
      return "!" + trigger + (rest ? " " + rest : "");
    }
  }
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  const rest = trimmed.slice(firstWord.length).trim();
  const canonical = firstWordMap.get(firstWord);
  if (canonical && rest.length > 0) return "!" + canonical + " " + rest;
  return null;
};
