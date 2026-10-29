import type { BunRequest } from "bun";
import { getFlashCookie, setFlashCookie } from "./flash";

export const stateHelpers = <T>() => ({
  getFlash: <R extends string>(req: BunRequest<R>): T => {
    return getFlashCookie<T, R>(req, "state");
  },

  setFlash: <R extends string>(req: BunRequest<R>, state: T): void => {
    setFlashCookie<T, R>(req, "state", state);
  },
});
