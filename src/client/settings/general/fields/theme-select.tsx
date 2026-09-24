const t = window.scopedT("core");

const THEME_OPTIONS = ["system", "light", "dark"] as const;

export const ThemeSelect = (): JSX.Element => (
  <div class="theme-select-wrap degoog-select-wrap degoog-select-wrap--flex">
    <select id="theme-select" class="theme-select">
      {THEME_OPTIONS.map((value) => (
        <option key={value} value={value}>
          {t(`settings-page.theme.${value}`)}
        </option>
      ))}
    </select>
  </div>
);
