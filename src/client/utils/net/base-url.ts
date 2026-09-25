declare global {
  interface Window {
    __DEGOOG_BASE_URL__?: string;
  }
}

export const getBase = (): string => window.__DEGOOG_BASE_URL__ ?? "";
