import { raw } from "../../tribute/rawdogit";

/**
 * Kept as raw markup so the serialised SVG stays byte-identical to the four
 * hand-written copies this replaces.
 */
export const CHEVRON_SVG =
  '<svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';

export const Chevron = (): JSX.Element => raw(CHEVRON_SVG);
