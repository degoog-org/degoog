const KEY = "degoog:uovadipasqua:chucknorris";
const VAL = "1";

const applyEffect = async (on) => {
  document
    .querySelectorAll(".logo-o1")
    .forEach((el) => el.classList.toggle("chuck-norris", on));
  const homeLogo = document.getElementById("home-logo");
  if (!homeLogo || !on) return;

  const chuckme = await window
    .fetch("https://api.chucknorris.io/jokes/random")
    .then((res) => res.json());
  if (chuckme?.value) {
    const allHailChuck = document.createElement("div");
    allHailChuck.textContent = chuckme.value;
    homeLogo.appendChild(allHailChuck);
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
