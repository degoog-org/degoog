const KEY = "degoog:uovadipasqua:logo-mot";
const VAL = "1";

const applyEffect = (on) => {
  document.documentElement.classList.toggle("degoog-udp-lm", on);
};

export const run = (ctx) => {
  const q = String(ctx?.query ?? "").trim().toLowerCase();
  if (q === "animateme off") {
    localStorage.removeItem(KEY);
    applyEffect(false);
    return;
  }
  localStorage.setItem(KEY, VAL);
  applyEffect(true);
};

export const restore = () => applyEffect(localStorage.getItem(KEY) === VAL);
