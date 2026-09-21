export interface FileUploadWidgetProps {
  inputId: string;
  buttonLabel: string;
  dropLabel: string;
  accept?: string;
  hint?: string;
  currentName?: string;
  extraClass?: string;
}

export const FileUploadWidget = ({
  inputId,
  buttonLabel,
  dropLabel,
  accept,
  hint,
  currentName,
  extraClass,
}: FileUploadWidgetProps): JSX.Element => {
  const hasName = Boolean(currentName);
  return (
    <>
      <div class={extraClass ? `degoog-file ${extraClass}` : "degoog-file"} data-degoog-file={true}>
        <input
          type="file"
          id={inputId}
          class="degoog-file-input"
          accept={accept}
          hidden={true}
        />
        <button type="button" class="degoog-file-trigger degoog-btn degoog-btn--secondary">
          <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>
          <span>{buttonLabel}</span>
        </button>
        <span class="degoog-file-name" hidden={!hasName}>
          {currentName ?? ""}
        </span>
        <span class="degoog-file-drop-hint">{dropLabel}</span>
        <button
          type="button"
          class="degoog-file-clear"
          hidden={!hasName}
          aria-label={buttonLabel}
        >
          {"×"}
        </button>
      </div>
      {hint ? <p class="degoog-file-hint">{hint}</p> : null}
    </>
  );
};
