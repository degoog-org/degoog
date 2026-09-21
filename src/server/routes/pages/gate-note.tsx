import { Raw } from "../../../shared/ui/core/raw";

export const GateNote = ({ html }: { html: string }): JSX.Element => (
  <div class="settings-auth-note" role="note">
    <p class="settings-auth-note-text">
      <Raw html={html} />
    </p>
  </div>
);
