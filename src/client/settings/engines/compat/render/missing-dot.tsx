import { copy } from "./copy";

export const CompatMissingDot = ({ layer }: { layer: string }): JSX.Element => (
  <span
    class="ext-needs-config-badge"
    data-tooltip={copy("compat-missing", layer)}
    data-tooltip-below={true}
    data-tooltip-end={true}
  ></span>
);
