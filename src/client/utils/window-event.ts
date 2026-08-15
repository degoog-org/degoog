export const onWindowEvent = (type: string, listener: () => void): void => {
  if (typeof window === "undefined") return;
  if (typeof window.addEventListener !== "function") return;
  window.addEventListener(type, listener);
};
