export const LangOption = ({
  code,
  label,
  active,
}: {
  code: string;
  label: string;
  active: boolean;
}): JSX.Element => (
  <button
    type="button"
    class={
      active
        ? "tools-option tools-lang-option degoog-menu-item active"
        : "tools-option tools-lang-option degoog-menu-item"
    }
    data-lang={code}
  >
    {label}
    {code ? (
      <>
        {" "}
        <span class="tools-lang-code">{code}</span>
      </>
    ) : null}
  </button>
);
