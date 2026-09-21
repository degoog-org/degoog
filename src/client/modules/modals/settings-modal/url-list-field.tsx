import { render } from "../../../../shared/ui/core/dom";
import { ExtField } from "./ext-field";
import { fieldDesc } from "./field-desc";
import type { SettingField, ExtensionMeta } from "../../../types";

const t = window.scopedT("core");

const _parseUrlListValue = (
  stored: string | string[] | undefined,
  defaultUrls: string[],
): string[] => {
  if (Array.isArray(stored)) {
    return stored.filter((u) => typeof u === "string" && u.startsWith("http"));
  }
  if (!stored || String(stored).trim() === "") return defaultUrls;
  try {
    const parsed = JSON.parse(String(stored)) as unknown;
    if (!Array.isArray(parsed)) return defaultUrls;
    return (parsed as unknown[]).filter(
      (u): u is string => typeof u === "string" && u.startsWith("http"),
    );
  } catch {
    return defaultUrls;
  }
};

export const UrlListField = ({
  field,
  ext,
}: {
  field: SettingField;
  ext: ExtensionMeta;
}): JSX.Element => {
  const defaultUrls = ext.defaultFeedUrls ?? [];
  const urls = _parseUrlListValue(
    ext.settings[field.key] as string | string[] | undefined,
    defaultUrls,
  );
  return (
    <ExtField fieldKey={field.key} type="urllist">
      <label class="ext-field-label">{field.label}</label>
      <ul class="ext-field-urllist">
        {urls.map((url) => (
          <li key={url} class="ext-field-urllist-item" data-url={url}>
            <span class="ext-field-urllist-url">{url}</span>
            <button
              type="button"
              class="ext-field-urllist-remove"
              aria-label={t("settings-page.modal.field-remove-aria")}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div class="ext-field-urllist-add">
        <input
          type="url"
          class="ext-field-input ext-field-urllist-input degoog-input"
          placeholder={field.placeholder || "https://example.com/feed.xml"}
          autocomplete="off"
        />
        <button type="button" class="ext-field-urllist-add-btn">
          {t("settings-page.modal.field-add")}
        </button>
      </div>
      <input type="hidden" id={`field-${field.key}`} class="ext-field-urllist-value" />
      {fieldDesc(field.description)}
    </ExtField>
  );
};

export function initUrlList(container: HTMLElement): void {
  const field = container.querySelector<HTMLElement>(
    ".ext-field[data-type='urllist']",
  );
  if (!field) return;
  const listEl = field.querySelector<HTMLElement>(".ext-field-urllist");
  const addInput = field.querySelector<HTMLInputElement>(
    ".ext-field-urllist-input",
  );
  const addBtn = field.querySelector<HTMLElement>(".ext-field-urllist-add-btn");
  const hiddenInput = field.querySelector<HTMLInputElement>(
    ".ext-field-urllist-value",
  );
  if (!listEl || !addInput || !addBtn || !hiddenInput) return;

  const initialUrls = [
    ...listEl.querySelectorAll<HTMLElement>(".ext-field-urllist-item"),
  ]
    .map((li) => li.dataset.url || "")
    .filter(Boolean);
  hiddenInput.value = JSON.stringify(initialUrls);

  const getUrls = (): string[] => {
    try {
      const parsed = JSON.parse(hiddenInput?.value || "[]") as unknown;
      return Array.isArray(parsed)
        ? (parsed as unknown[]).filter(
          (u): u is string => typeof u === "string",
        )
        : [];
    } catch {
      return [];
    }
  };

  function setUrls(urls: string[]): void {
    if (hiddenInput) hiddenInput.value = JSON.stringify(urls);
  }

  function addUrl(url: string): void {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) return;
    try {
      new URL(trimmed);
    } catch {
      return;
    }
    const urls = getUrls();
    if (urls.includes(trimmed)) return;
    urls.push(trimmed);
    setUrls(urls);
    const li = document.createElement("li");
    li.className = "ext-field-urllist-item";
    li.dataset.url = trimmed;
    render(
      <>
        <span class="ext-field-urllist-url">{trimmed}</span>
        <button
          type="button"
          class="ext-field-urllist-remove"
          aria-label={t("settings-page.modal.field-remove-aria")}
        >
          ×
        </button>
      </>,
      li,
    );
    li.querySelector(".ext-field-urllist-remove")?.addEventListener(
      "click",
      () => {
        setUrls(getUrls().filter((x) => x !== trimmed));
        li.remove();
      },
    );
    listEl?.appendChild(li);
  }

  field
    .querySelectorAll<HTMLElement>(".ext-field-urllist-remove")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = btn.closest<HTMLElement>(".ext-field-urllist-item");
        const url = li?.dataset?.url;
        if (!url) return;
        setUrls(getUrls().filter((u) => u !== url));
        li?.remove();
      });
    });

  addBtn.addEventListener("click", () => {
    if (addInput.value) {
      addUrl(addInput.value);
      addInput.value = "";
    }
  });
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (addInput.value) {
        addUrl(addInput.value);
        addInput.value = "";
      }
    }
  });
}
