import { searchListsFile } from "../paths";
import { createListStore } from "../storage/list-store";
import { SEARCH_LIST_FIELDS } from "../../../shared/settings-lists";

type DomainListKey = (typeof SEARCH_LIST_FIELDS)[number];
const store = createListStore<DomainListKey>({
  keys: SEARCH_LIST_FIELDS,
  file: searchListsFile,
  namespace: "domain-lists",
});

export const isDomainListKey = store.isListKey;
export const readDomainLists = store.readLists;
export const writeDomainList = store.writeList;
