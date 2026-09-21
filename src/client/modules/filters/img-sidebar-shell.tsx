import { ENGINE_PANEL_ID, GROUPS_ID } from "./ids";

export interface ImgSidebarShellProps {
  title: string;
  closeLabel: string;
}

export const ImgSidebarShell = ({ title, closeLabel }: ImgSidebarShellProps): JSX.Element => (
  <div class="degoog-img-sidebar">
    <div class="degoog-img-sidebar-head">
      <span class="degoog-img-sidebar-title">{title}</span>
      <button type="button" class="degoog-img-sidebar-close" aria-label={closeLabel}>
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="degoog-img-sidebar-body">
      <div id={ENGINE_PANEL_ID}></div>
      <div id={GROUPS_ID}></div>
    </div>
  </div>
);
