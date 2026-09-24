export interface AcSuggestion {
  text: string;
  source: string;
  rich?: { description?: string; thumbnail?: string; type?: string };
}

const _source = (source: string): string =>
  source?.replace(/Autocomplete/gi, "")?.trim();

export const AutocompleteItem = ({
  suggestion,
  onPick,
}: {
  suggestion: AcSuggestion;
  onPick: (text: string) => void;
}): JSX.Element => {
  const rich = suggestion.rich;
  const isRich = !!rich && (!!rich.description || !!rich.thumbnail);
  const pick = (event: Event): void => {
    event.preventDefault();
    onPick(suggestion.text);
  };
  if (!isRich) {
    return (
      <div class="ac-item" data-text={suggestion.text} onMouseDown={pick}>
        <span class="degoog-ac-text">{suggestion.text}</span>
        <span class="degoog-ac-source">{_source(suggestion.source)}</span>
      </div>
    );
  }
  return (
    <div class="ac-item degoog-ac-rich" data-text={suggestion.text} onMouseDown={pick}>
      {rich?.thumbnail ? (
        <img
          class="degoog-ac-rich-thumb"
          src={rich.thumbnail}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <div class="degoog-ac-rich-body">
        <div class="degoog-ac-rich-title">
          {suggestion.text}
          {rich?.type ? <span class="degoog-ac-rich-type">{rich.type}</span> : null}
        </div>
        {rich?.description ? (
          <span class="degoog-ac-rich-desc">{rich.description}</span>
        ) : null}
      </div>
      <span class="degoog-ac-source">{_source(suggestion.source)}</span>
    </div>
  );
};
