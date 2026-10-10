import { Button } from "../../../../../shared/ui/components/primitives/button";
import { BusyLabel } from "../busy-label";
import { st } from "../../format";
import type { StoreActions, StoreState } from "../../../../types/store-tab";

export const ADD_INPUT_ID = "store-add-url";
const ADD_FORM_ID = "store-add";

export const RepoAddForm = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => (
  <form
    class="store-add"
    id={ADD_FORM_ID}
    autocomplete="off"
    onSubmit={(event) => {
      event.preventDefault();
      actions.addRepo();
    }}
  >
    <label class="store-add-label" for={ADD_INPUT_ID}>
      {st("add-label")}
    </label>
    <div class="store-add-row">
      <input
        type="text"
        class="degoog-input"
        id={ADD_INPUT_ID}
        placeholder={st("placeholder-url")}
        spellcheck="false"
        value={state.addDraft}
        disabled={state.adding}
        onInput={(event) => actions.setAddDraft((event.currentTarget as HTMLInputElement).value)}
      />
      <Button variant="primary" type="submit" disabled={state.adding}>
        {state.adding ? <BusyLabel label={st("adding")} /> : st("add-repo")}
      </Button>
    </div>
    <p class="store-add-error" role="alert">
      {state.addError}
    </p>
    <p class="settings-row-desc">
      {st("repo-image-before")}
      <code class="store-code">repo-image</code>
      {st("repo-image-after")}
    </p>
  </form>
);
