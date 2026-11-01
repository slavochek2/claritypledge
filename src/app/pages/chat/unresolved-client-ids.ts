/**
 * @file unresolved-client-ids.ts
 * @description P1536: the client id of a canvas send, kept for the SAME message until its outcome is known. `canvas_workspace_send` is
 * idempotent on its client id (a repeat returns the first result), so a lost response (a thrown error) must be retried with the id it
 * had, or the retry duplicates the message and starts a second paid run. A definite answer (success or a typed refusal) settles the id:
 * the next send of the same words is a new message. One helper for every caller (the first Send of a Clone, a text Send, a file).
 */

export interface UnresolvedClientIds {
  /** The id for this message: the one an earlier unresolved attempt used, else a new one. */
  idFor: (key: string) => string;
  /** The outcome is known: the next message with this key is a new one. */
  settle: (key: string) => void;
  /** Tests only. */
  reset: () => void;
}

export function createUnresolvedClientIds(): UnresolvedClientIds {
  const open = new Map<string, string>();
  return {
    idFor(key) {
      let id = open.get(key);
      if (!id) {
        id = crypto.randomUUID();
        open.set(key, id);
      }
      return id;
    },
    settle: (key) => void open.delete(key),
    reset: () => open.clear(),
  };
}
