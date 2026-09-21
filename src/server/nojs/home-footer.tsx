import { Raw } from "../../shared/ui/core/raw";

export const HomeFooter = ({ html }: { html: string }): JSX.Element => (
  <div id="home-footer">
    <Raw html={html} />
  </div>
);
