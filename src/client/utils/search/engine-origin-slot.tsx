export const EngineOriginSlot = ({
  engineName,
  engineId,
}: {
  engineName: string;
  engineId?: string;
}): JSX.Element => (
  <span class="engine-origin" data-engine={engineName} data-engine-id={engineId}></span>
);
