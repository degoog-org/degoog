import { render } from "../../../shared/ui/tribute/dom";
import { ExtGroup } from "../../../shared/ui/components/extensions/ext-group";
import { BuiltInCard } from "./built-in-card";
import { ThemeCard } from "./theme-card";
import type { ExtensionMeta } from "../../types";

const t = window.scopedT("core");

export async function initThemesTab(
  themesData: { activeId: string | null },
  themeExts: ExtensionMeta[],
): Promise<void> {
  const container = document.getElementById("themes-content");
  if (!container) return;

  const activeId = themesData.activeId;
  render(
    <ExtGroup label={t("settings-page.extensions.group-themes")}>
      <BuiltInCard activeId={activeId} />
      {themeExts.map((ext) => (
        <ThemeCard key={ext.id} ext={ext} activeId={activeId} />
      ))}
    </ExtGroup>,
    container,
  );
}
