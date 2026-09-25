import { EngineOriginDisplay, type EngineOrigin } from "../../../shared/engine-origins";

interface EngineOriginSlotProps {
  origin: EngineOrigin;
  mode: EngineOriginDisplay;
  engineName: string;
  engineId?: string;
  label: string;
}

export const EngineOriginSlot = ({
  origin,
  mode,
  engineName,
  engineId,
  label,
}: EngineOriginSlotProps): JSX.Element | null => {
  const src =
    mode === EngineOriginDisplay.Favicon && origin.favicon
      ? origin.favicon
      : origin.icon;
  const artwork = src ? (
    <img class="engine-origin-icon" src={src} alt="" loading="lazy" />
  ) : origin.glyph ? (
    <i class={`fa-solid ${origin.glyph} engine-origin-glyph`}></i>
  ) : null;
  if (!artwork) return null;
  return (
    <span
      class="engine-origin"
      data-engine={engineName}
      data-engine-id={engineId}
      title={label}
      aria-label={label}
    >
      {artwork}
    </span>
  );
};
