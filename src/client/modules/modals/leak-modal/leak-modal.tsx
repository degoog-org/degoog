import { render } from "../../../../shared/ui/tribute/dom";
import { Button } from "../../../../shared/ui/components/primitives/button";
import { mountModalShell, onBackdropClick, type MountedModal } from "../../../../shared/ui/components/overlay/shell";
import type { LeakItemProps } from "./leak-item";
import { LeakList } from "./leak-list";
import { allowLeaksForSession } from "../../../utils/app/leak-allow";

const t = window.scopedT("core");

const MODAL_ID = "leak-modal";
const LEAK_REPORT_URL = "https://github.com/degoog-org/degoog/issues";

let shell: MountedModal | null = null;
let items: LeakItemProps[] = [];

function _close(): void {
  shell?.hide();
  items = [];
}

function _ensureMounted(): MountedModal {
  if (shell) return shell;
  shell = mountModalShell({
    id: MODAL_ID,
    title: t("leak-guard.title"),
    footer: [
      <div class="leak-modal-actions">
        <Button variant="secondary" id={`${MODAL_ID}-report`}>
          {t("leak-guard.report")}
        </Button>
        <Button variant="primary" id={`${MODAL_ID}-ok`}>
          {t("leak-guard.close")}
        </Button>
      </div>,
      <Button variant="danger" class="leak-modal-continue" id={`${MODAL_ID}-continue`}>
        {t("leak-guard.continue")}
      </Button>,
    ],
  });
  document.getElementById(`${MODAL_ID}-ok`)?.addEventListener("click", _close);
  document.getElementById(`${MODAL_ID}-continue`)?.addEventListener("click", allowLeaksForSession);
  document.getElementById(`${MODAL_ID}-report`)?.addEventListener("click", () => {
    window.open(LEAK_REPORT_URL, "_blank", "noopener,noreferrer");
  });
  shell.close.addEventListener("click", _close);
  onBackdropClick(shell.overlay, _close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shell?.isOpen()) _close();
  });
  return shell;
}

export function showBlockedLeak(item: LeakItemProps): void {
  if (items.some((known) => known.url === item.url)) return;
  items = [...items, item];
  const mounted = _ensureMounted();
  render(
    <LeakList
      intro={t("leak-guard.intro")}
      outro={`${t("leak-guard.outro")} ${t("leak-guard.continue-hint")}`}
      items={items}
    />,
    mounted.body,
  );
  if (!mounted.isOpen()) mounted.open();
}
