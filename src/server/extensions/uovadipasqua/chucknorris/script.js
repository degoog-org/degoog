const KEY = "degoog:uovadipasqua:chucknorris";
const VAL = "1";

let _apiBase = null;

const applyEffect = async (on) => {
  document
    .querySelectorAll(".logo-o1")
    .forEach((el) => el.classList.toggle("chuck-norris", on));
  const homeLogo = document.getElementById("home-logo");
  if (!homeLogo || !on || !_apiBase) return;

  try {
    const res = await fetch(`${_apiBase}/joke`);
    if (!res.ok) return;
    const data = await res.json();
    if (data?.value) {
      const allHailChuck = document.createElement("div");
      allHailChuck.textContent = data.value;
      homeLogo.appendChild(allHailChuck);
    }
  } catch {
    return;
  }
};

export const run = async (ctx) => {
  if (ctx?.apiBase) _apiBase = ctx.apiBase;
  const q = String(ctx?.query ?? "")
    .trim()
    .toLowerCase();
  if (q === "chuck norris off") {
    localStorage.removeItem(KEY);
    await applyEffect(false);
    return;
  }
  localStorage.setItem(KEY, VAL);
  await applyEffect(true);
};

export const restore = async (ctx) => {
  if (ctx?.apiBase) _apiBase = ctx.apiBase;
  await applyEffect(localStorage.getItem(KEY) === VAL);
};
