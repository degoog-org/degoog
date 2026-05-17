const RAIN_DURATION_MS = 5000;
const DROP_COUNT = 60;

function _spawnDrop(container, avatarUrl) {
  const img = document.createElement("img");
  img.src = avatarUrl;
  img.alt = "";
  img.className = "egg-fccview-drop";
  const left = Math.random() * 100;
  const size = 32 + Math.random() * 56;
  const duration = 2.5 + Math.random() * 2;
  const delay = Math.random() * 2;
  const rotate = (Math.random() * 720 - 360).toFixed(0);
  img.style.left = `${left}vw`;
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
  img.style.animationDuration = `${duration}s`;
  img.style.animationDelay = `${delay}s`;
  img.style.setProperty("--egg-fccview-rotate", `${rotate}deg`);
  container.appendChild(img);
}

const AVATAR_PATH = "/uovadipasqua/builtin-fccview-uovadipasqua/avatar.png";

export function run() {
  const avatarUrl = `${window.__DEGOOG_BASE_URL__ ?? ""}${AVATAR_PATH}`;
  if (!avatarUrl) return;
  const container = document.createElement("div");
  container.className = "egg-fccview-rain";
  document.body.appendChild(container);
  for (let i = 0; i < DROP_COUNT; i++) _spawnDrop(container, avatarUrl);
  window.setTimeout(() => container.remove(), RAIN_DURATION_MS + 2500);
}
