import { mountModalShell, onBackdropClick, type MountedModal } from "../../../../shared/ui/components/overlay/shell";
import { getBase } from "../../../utils/net/base-url";
import { renderMdBlock } from "../../../utils/dom/md";

const t = window.scopedT("core");

const MODAL_ID = "privacy-policy-modal";
const LINK_ID = "home-privacy-policy-link";

let shell: MountedModal | null = null;

type PrivacyWindow = Window & { __DEGOOG_PRIVACY_POLICY__?: boolean };

function _ensureMounted(): MountedModal {
  if (shell) return shell;
  shell = mountModalShell({
    id: MODAL_ID,
    wide: true,
    title: t("privacy-policy.title"),
    modalClass: "ext-docs-modal",
    bodyClass: "ext-docs-body",
  });
  const hide = (): void => shell?.hide();
  shell.close.addEventListener("click", hide);
  onBackdropClick(shell.overlay, hide);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shell?.isOpen()) hide();
  });
  return shell;
}

async function _openPrivacyPolicy(): Promise<void> {
  const modal = _ensureMounted();
  modal.body.textContent = t("privacy-policy.loading");
  modal.open();
  try {
    const res = await fetch(`${getBase()}/api/privacy-policy`);
    if (!res.ok) throw new Error(`privacy policy ${res.status}`);
    const { markdown } = (await res.json()) as { markdown?: string };
    modal.body.innerHTML = renderMdBlock(typeof markdown === "string" ? markdown : "");
  } catch (err) {
    console.warn("[privacy-policy] load failed", err);
    modal.body.textContent = t("privacy-policy.error");
  }
  setTimeout(() => modal.close.focus(), 0);
}

export function initPrivacyPolicyLink(): void {
  if (!(window as PrivacyWindow).__DEGOOG_PRIVACY_POLICY__) return;
  document.querySelectorAll<HTMLElement>("[data-privacy-policy]").forEach((el) => {
    el.hidden = false;
  });
  document.getElementById(LINK_ID)?.addEventListener("click", (e) => {
    e.preventDefault();
    void _openPrivacyPolicy();
  });
}
