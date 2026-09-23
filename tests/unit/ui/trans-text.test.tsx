import { describe, expect, test } from "bun:test";
import { renderHtml } from "../../../src/shared/ui/tribute/html";
import { TransText } from "../../../src/shared/ui/components/primitives/trans-text";

const Link = (): JSX.Element => <a href="/settings/store">Store</a>;

describe("TransText", () => {
  test("substitutes a component for its placeholder", () => {
    expect(
      renderHtml(
        <TransText
          text="No engines installed. The {store} tab is where they live."
          slots={{ store: <Link /> }}
        />,
      ),
    ).toBe(
      'No engines installed. The <a href="/settings/store">Store</a> tab is where they live.',
    );
  });

  test("escapes the surrounding translation instead of trusting it", () => {
    expect(
      renderHtml(
        <TransText
          text="<script>alert(1)</script> {store}"
          slots={{ store: <Link /> }}
        />,
      ),
    ).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; <a href="/settings/store">Store</a>',
    );
  });

  test("leaves a placeholder with no slot as literal text", () => {
    expect(
      renderHtml(
        <TransText text="a {missing} b" slots={{ store: <Link /> }} />,
      ),
    ).toBe("a {missing} b");
  });
});
