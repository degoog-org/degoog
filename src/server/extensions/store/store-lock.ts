import { createMutex } from "../../utils/mutex";

/**
 * Single store-wide lock shared by every git and filesystem mutation in the
 * extension store. Repo clone/fetch/reset and item install/update/uninstall all
 * queue through here so two git processes never touch the same shallow repo at
 * once. This is what stops the ".git/shallow.lock" and "shallow file has
 * changed" failures when operations stack up.
 *
 * The mutex is not reentrant: anything already holding it must call only the
 * unlocked internal helpers, never the public locked wrappers.
 */
export const runStoreExclusive = createMutex();
