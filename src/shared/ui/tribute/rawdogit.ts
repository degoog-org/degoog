import type { RawNode } from "./types";

/**
 * Wraps trusted plugins, slot panels and extension-owned html to render it. It's a tradeoff, seems
 * a bit dodgy but it's the only way to keep the system as open as we had without absolutely compromising shit.
 *
 * @description DO NOT USE THIS FOR UNTRUSTED HTML, MAY AS WELL BE CALLED "DANGEROUSLYRENDERHTML"
 */
export const raw = (html: string | null | undefined): RawNode => ({
  k: "raw",
  html: html ?? "",
});

export const RawDogIt = (props: { html: string | null | undefined }): RawNode =>
  raw(props.html);
