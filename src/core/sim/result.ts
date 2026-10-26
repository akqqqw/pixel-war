/** Result of a player action: the interface shows the message on failure. */
export interface ActionResult {
  ok: boolean;
  message?: string;
}

export const OK: ActionResult = { ok: true };

export function fail(message: string): ActionResult {
  return { ok: false, message };
}
