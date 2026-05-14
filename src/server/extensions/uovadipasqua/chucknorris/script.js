const KEY = "degoog:uovadipasqua:chucknorris";
const VAL = "1";

const injectCss = () => {
  const href = new URL("style.css", import.meta.url).href;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
};

const applyEffect = async (on) => {
  if (on) injectCss();
  document
    .querySelectorAll(".logo-o1")
    .forEach((el) => el.classList.toggle("chuck-norris", on));
  const homeLogo = document.getElementById("home-logo");
  if (!homeLogo || !on) return;

  const randomJoke = await window
    .fetch("https://api.chucknorris.io/jokes/random")
    .then((res) => res.json());
  if (randomJoke?.value) {
    const joke = document.createElement("div");
    joke.textContent = randomJoke.value;
    homeLogo.appendChild(joke);
  }
};

export const run = async (ctx) => {
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

export const restore = () => applyEffect(localStorage.getItem(KEY) === VAL);
