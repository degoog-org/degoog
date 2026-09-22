import { getBase } from "../../utils/base-url";
import { flashError, flashSuccess } from "./flash-msg";

const t = window.scopedT("core");

export const extToggleHandler = (
  id: string,
  initiallyEnabled: boolean,
  label: string,
): ((event: Event) => void) => {
  let reqToken = 0;
  let confirmed = initiallyEnabled;

  return (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const intended = input.checked;
    const token = ++reqToken;

    void (async (): Promise<void> => {
      try {
        const res = await fetch(
          `${getBase()}/api/extensions/${encodeURIComponent(id)}/settings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ disabled: intended ? "" : "true" }),
          },
        );
        if (!res.ok) throw new Error("save failed");
        if (token !== reqToken) return;
        confirmed = intended;
        window.dispatchEvent(new CustomEvent("extensions-saved"));
        flashSuccess(t("settings-page.server.saved"));
      } catch (err) {
        console.warn(`[settings] ${label} toggle failed`, err);
        if (token !== reqToken) return;
        input.checked = confirmed;
        flashError(t("settings-page.server.save-failed-network"));
      }
    })();
  };
};
