import { RawDogIt } from "../../shared/ui/tribute/rawdogit";

export const ImageGrid = ({ html }: { html: string }): JSX.Element => (
  <div class="image-grid">
    <RawDogIt html={html} />
  </div>
);
