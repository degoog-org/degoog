import { Button } from "../../../shared/ui/components/primitives/button";
import { getBase } from "../../utils/net/base-url";

const themeT = window.scopedT("themes/degoog");

const _applyTheme = async (id: string | null, button: HTMLButtonElement): Promise<void> => {
  button.disabled = true;
  try {
    const res = await fetch(`${getBase()}/api/theme/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error("Failed");
    window.location.reload();
  } catch {
    button.disabled = false;
  }
};

export const ApplyButton = ({
  themeId,
  disabled,
}: {
  themeId: string;
  disabled: boolean;
}): JSX.Element => (
  <Button
    variant="secondary"
    class="ext-card-apply"
    data-theme-id={themeId}
    disabled={disabled}
    onClick={(event) =>
      void _applyTheme(
        themeId === "built-in" ? null : themeId,
        event.currentTarget as HTMLButtonElement,
      )
    }
  >
    {themeT("search-templates.tabs.apply")}
  </Button>
);
