import { Raw } from "../../core/raw";

/**
 * Wraps a theme's template file in the `<template id="degoog-*">` element that
 * the client template engine looks up. The content is authored HTML and is
 * injected verbatim.
 */
export const ThemeTemplate = ({
  id,
  content,
}: {
  id: string;
  content: string;
}): JSX.Element => (
  <template id={`degoog-${id}`}>
    <Raw html={content} />
  </template>
);
