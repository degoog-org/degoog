const _scoreT = window.scopedT("core");

export const scoreRowTemplate = (
  domain: string,
  score: string,
): HTMLDivElement => {
  const row = document.createElement("div");
  row.className = "settings-score-row";

  const domainInput = document.createElement("input");
  domainInput.type = "text";
  domainInput.className = "settings-score-domain degoog-input";
  domainInput.placeholder = _scoreT(
    "settings-page.server.domain-score-domain-placeholder",
  );
  domainInput.value = domain;

  const scoreInput = document.createElement("input");
  scoreInput.type = "number";
  scoreInput.className = "settings-score-value degoog-input";
  scoreInput.placeholder = _scoreT(
    "settings-page.server.domain-score-value-placeholder",
  );
  scoreInput.value = score;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "settings-score-remove degoog-icon-btn";
  remove.setAttribute(
    "aria-label",
    _scoreT("settings-page.server.domain-score-remove-aria"),
  );
  remove.textContent = "×";
  remove.addEventListener("click", () => row.remove());

  row.append(domainInput, scoreInput, remove);
  return row;
};

export function renderScoreRows(raw: string): void {
  const wrap = document.getElementById("settings-domain-score-rows");
  if (!wrap) return;
  wrap.innerHTML = "";
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line) => {
      const [domain, score] = line.split("|").map((s) => s.trim());
      wrap.appendChild(scoreRowTemplate(domain ?? "", score ?? ""));
    });
}

export const serializeScoreRows = (): string => {
  const wrap = document.getElementById("settings-domain-score-rows");
  if (!wrap) return "";
  const lines: string[] = [];
  wrap
    .querySelectorAll<HTMLDivElement>(".settings-score-row")
    .forEach((row) => {
      const domain = row
        .querySelector<HTMLInputElement>(".settings-score-domain")
        ?.value.trim();
      const score = row
        .querySelector<HTMLInputElement>(".settings-score-value")
        ?.value.trim();
      if (!domain || !score) return;
      if (!Number.isFinite(Number(score))) return;
      lines.push(`${domain}|${Math.trunc(Number(score))}`);
    });
  return lines.join("\n");
};
