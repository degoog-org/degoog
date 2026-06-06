const t = window.scopedT("core");

interface _Result {
  label: string;
  text: string;
  tab: string;
  el: HTMLElement;
}

const _buildIndex = (): _Result[] => {
  const results: _Result[] = [];

  document
    .querySelectorAll<HTMLElement>(".settings-tab-panel:not(#tab-store)")
    .forEach((panel) => {
      const tab = panel.id.replace("tab-", "");

      panel.querySelectorAll<HTMLElement>(".settings-section").forEach((section) => {
        const label =
          section.querySelector(".settings-section-heading")?.textContent?.trim() ?? "";
        if (label) results.push({ label, text: section.textContent?.toLowerCase() ?? "", tab, el: section });
      });

      panel.querySelectorAll<HTMLElement>(".ext-card").forEach((card) => {
        const label =
          card.querySelector(".ext-card-name")?.textContent?.trim() ?? "";
        if (label) results.push({ label, text: card.textContent?.toLowerCase() ?? "", tab, el: card });
      });
    });

  return results;
};

const _getOrCreateNoResults = (main: HTMLElement): HTMLElement => {
  let el = document.getElementById("settings-search-no-results");
  if (!el) {
    el = document.createElement("p");
    el.id = "settings-search-no-results";
    el.className="ext-card settings-desc degoog-panel degoog-panel--ext-card";
    main.appendChild(el);
  }
  return el;
};

export function initGlobalSearch(): void {
  const input = document.getElementById(
    "settings-global-search",
  ) as HTMLInputElement | null;
  const main = document.querySelector<HTMLElement>(".settings-page-main");
  if (!input || !main) return;

  const index = _buildIndex();

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const noResults = _getOrCreateNoResults(main);

    if (!q) {
      main.classList.remove("settings-search-active", "settings-search-empty", "settings-search-has-save");
      noResults.hidden = true;
      document
        .querySelectorAll<HTMLElement>(".settings-section, .ext-card, .ext-group")
        .forEach((el) => {
          el.style.display = "";
        });
      return;
    }

    main.classList.add("settings-search-active");

    document
      .querySelectorAll<HTMLElement>(
        ".settings-section, .ext-card:not(#settings-search-no-results)",
      )
      .forEach((el) => {
        el.style.display = "none";
      });

    const matches = index.filter((r) => r.text.includes(q));
    matches.forEach((r) => {
      r.el.style.display = "";
    });

    const needsSave = matches.some((r) => r.tab === "server");
    main.classList.toggle("settings-search-has-save", needsSave);

    document.querySelectorAll<HTMLElement>(".ext-group").forEach((group) => {
      const anyVisible = Array.from(
        group.querySelectorAll<HTMLElement>(".ext-card"),
      ).some((c) => c.style.display !== "none");
      group.style.display = anyVisible ? "" : "none";
    });

    if (matches.length === 0) {
      main.classList.add("settings-search-empty");
      noResults.textContent = t("settings-page.tab-search.no-results");
      noResults.hidden = false;
    } else {
      main.classList.remove("settings-search-empty");
      noResults.hidden = true;
    }
  });
}
