import { render } from "../../../../shared/ui/tribute/dom";
import { getAllSearchTypes } from "../../../utils/search/engines";
import { saveField } from "../../../utils/settings/settings-api";
import { flashError, flashSuccess } from "../../shared/flash-msg";
import { EngineTypeToggle } from "../engine-type-toggle";

const t = window.scopedT("core");

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
    console.warn(
      "[settings] could not load search types for streaming controls",
      err,
    );
    return;
  }

  if (types.length <= 1) {
    container.remove();
    return;
  }

  let _saving = false;
  let _saveAgain = false;

  const _save = async (): Promise<void> => {
    if (_saving) {
      _saveAgain = true;
      return;
    }
    _saving = true;
    do {
      _saveAgain = false;
      const checks = container.querySelectorAll<HTMLInputElement>(
        "input[type=checkbox]",
      );
      const nowDisabled = [...checks]
        .filter((c) => !c.checked)
        .map((c) => c.value)
        .join("\n");
      const ok = await saveField(
        "streamingDisabledTypes",
        nowDisabled,
        getToken,
      );
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
        <EngineTypeToggle
          key={type}
          type={type}
          checked={!disabled.has(type)}
          onChange={() => void _save()}
        />
      ))}
    </>,
    container,
  );
}
