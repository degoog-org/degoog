export function showHome(): void {
  window.location.href = "/";
}

export function setActiveTab(type: string): void {
  document.querySelectorAll<HTMLElement>(".results-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.type === type);
  });
}
