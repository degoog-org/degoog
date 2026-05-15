const PARTICLE_SIZE = 6;
const PARTICLE_DENSITY = 0.0025;
const MAX_PARTICLES = 300;

function _spawnParticle(container, x, y, color, sweepProgress) {
  const p = document.createElement("div");
  p.className = "egg-thanos-particle";
  p.style.left = `${x}px`;
  p.style.top = `${y}px`;
  p.style.width = `${PARTICLE_SIZE}px`;
  p.style.height = `${PARTICLE_SIZE}px`;
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
  const dist = 90 + Math.random() * 180;
  p.style.setProperty("--egg-thanos-dx", `${Math.cos(angle) * dist}px`);
  p.style.setProperty("--egg-thanos-dy", `${Math.sin(angle) * dist}px`);
  p.style.setProperty(
    "--egg-thanos-rot",
    `${(Math.random() * 180 - 90).toFixed(0)}deg`,
  );
  p.style.animationDelay = `${sweepProgress * 1.2}s`;
  p.style.background = color;
  p.style.opacity = String(0.5 + Math.random() * 0.4);
  container.appendChild(p);
}

export function run() {
  const target =
    document.getElementById("results-layout") ||
    document.getElementById("results-list");
  if (!target) return;
  const rect = target.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return;

  const area = rect.width * rect.height;
  const count = Math.min(MAX_PARTICLES, Math.floor(area * PARTICLE_DENSITY));
  const color = window.getComputedStyle(target).color || "#888";

  const container = document.createElement("div");
  container.className = "egg-thanos-rain";
  document.body.appendChild(container);

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const x = rect.left + Math.random() * rect.width;
    const y = rect.top + Math.random() * rect.height;
    const sweep = (x - rect.left) / rect.width;
    _spawnParticle(fragment, x, y, color, sweep);
  }
  container.appendChild(fragment);

  target.classList.add("egg-thanos-fading");
  window.setTimeout(() => {
    container.remove();
    target.classList.remove("egg-thanos-fading");
  }, 4500);
}
