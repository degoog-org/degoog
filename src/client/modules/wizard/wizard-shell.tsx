export const WizardShell = (): JSX.Element => (
  <>
    <div class="degoog-wizard__mask degoog-wizard__mask--top"></div>
    <div class="degoog-wizard__mask degoog-wizard__mask--right"></div>
    <div class="degoog-wizard__mask degoog-wizard__mask--bottom"></div>
    <div class="degoog-wizard__mask degoog-wizard__mask--left"></div>
    <div class="degoog-wizard__ring"></div>
    <div class="degoog-wizard__popover degoog-panel" role="dialog" aria-modal="true">
      <div class="degoog-wizard__progress"></div>
      <h2 class="degoog-wizard__title"></h2>
      <p class="degoog-wizard__body"></p>
      <a class="degoog-wizard__link" target="_blank" rel="noopener" hidden={true}></a>
      <div class="degoog-wizard__hint" hidden={true}></div>
      <div class="degoog-wizard__footer">
        <button type="button" class="degoog-btn degoog-wizard__skip"></button>
        <div class="degoog-wizard__nav">
          <button type="button" class="degoog-btn degoog-btn--secondary degoog-wizard__back"></button>
          <button type="button" class="degoog-btn degoog-btn--primary degoog-wizard__next"></button>
        </div>
      </div>
    </div>
  </>
);
