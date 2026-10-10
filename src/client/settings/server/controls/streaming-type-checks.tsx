import { render } from "../../../../shared/ui/tribute/dom";
import { getAllSearchTypes } from "../../../utils/search/engines";
import { saveField } from "../../../utils/settings/settings-api";
import { flashError, flashSuccess } from "../../shared/flash-msg";
import { EngineTypeToggle } from "../engine-type-toggle";

const t = window.scopedT("core");

const FILTER_FROM = 12;

const _checks = (container: HTMLElement): HTMLInputElement[] => [
  ...container.querySelectorAll<HTMLInputElement>("input[type=checkbox]"),
];

function _updateCount(container: HTMLElement): void {
  const count = document.getElementById("settings-streaming-types-count");
  if (!count) return;
  const checks = _checks(container);
  count.textContent = t("settings-page.server.streaming-types-count", {
    on: String(checks.filter((c) => c.checked).length),
    total: String(checks.length),
  });
}

function _bindFilter(container: HTMLElement, total: number): void {
  const wrap = document.getElementById("settings-streaming-types-filter-wrap");
  const input = document.getElementById("settings-streaming-types-filter") as HTMLInputElement | null;
  if (!wrap || !input || total < FILTER_FROM) return;
  wrap.hidden = false;
  input.addEventListener("input", () => {
    const needle = input.value.trim().toLowerCase();
    container.querySelectorAll<HTMLElement>("[data-type]").forEach((el) => {
      el.hidden = needle !== "" && !(el.dataset.type ?? "").toLowerCase().includes(needle);
    });
  });
}

export async function initStreamingTypeChecks(
  disabledTypes: string,
  getToken: () => string | null,
): Promise<void> {
  const container = document.getElementById("settings-streaming-type-checks");
  if (!container) return;
  const disabled = new Set(
    disabledTypes
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  let types: string[];
  try {
    types = [...(await getAllSearchTypes())];
  } catch (err) {
    console.warn("[settings] could not load search types for streaming controls", err);
    return;
  }

  if (types.length <= 1) {
    document.getElementById("settings-streaming-types-row")?.remove();
    return;
  }

  let _saving = false;
  let _saveAgain = false;

  const _save = async (): Promise<void> => {
    _updateCount(container);
    if (_saving) {
      _saveAgain = true;
      return;
    }
    _saving = true;
    do {
      _saveAgain = false;
      const nowDisabled = _checks(container)
        .filter((c) => !c.checked)
        .map((c) => c.value)
        .join("\n");
      const ok = await saveField("streamingDisabledTypes", nowDisabled, getToken);
      if (ok) {
        window.dispatchEvent(new Event("extensions-saved"));
        flashSuccess(t("settings-page.server.saved"));
      } else {
        flashError(t("settings-page.server.save-failed-network"));
      }
    } while (_saveAgain);
    _saving = false;
  };

  render(
    <>
      {types.map((type) => (
        <EngineTypeToggle key={type} type={type} checked={!disabled.has(type)} onChange={() => void _save()} />
      ))}
    </>,
    container,
  );
  _updateCount(container);
  _bindFilter(container, types.length);
}
