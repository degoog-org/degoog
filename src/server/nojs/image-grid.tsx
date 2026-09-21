import { Raw } from "../../shared/ui/core/raw";

export const ImageGrid = ({ html }: { html: string }): JSX.Element => (
  <div class="image-grid">
    <Raw html={html} />
  </div>
);
