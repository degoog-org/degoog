import { indexerConfigFile } from "../../utils/paths";
import { createListStore } from "../../utils/storage/list-store";
import { OVERSIZED_TEXT_FIELDS } from "../../../shared/indexer";

type IndexerListKey = (typeof OVERSIZED_TEXT_FIELDS)[number];
const store = createListStore<IndexerListKey>({
  keys: OVERSIZED_TEXT_FIELDS,
  file: indexerConfigFile,
  namespace: "indexer-config",
});

export const isIndexerListKey = store.isListKey;
export const readIndexerLists = store.readLists;
export const writeIndexerList = store.writeList;
