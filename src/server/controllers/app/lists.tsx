import type { BunRequest } from "bun";
import { getSessionContext, requireAuth } from "../../middleware/auth";
import { csrfProtection } from "../../middleware/csrf";
import { SETS } from "../../services/cards";
import { createCsrfToken } from "../../services/csrf";
import {
  deleteList,
  duplicateList,
  getListsByUser,
  getTradeListBySlug,
  type ListCardRow,
} from "../../services/lists";
import { BuilderPage } from "../../templates/builder";
import type { ListsState } from "../../templates/lists";
import { Lists } from "../../templates/lists";
import type { SlugRequest } from "../../utils/request";
import { redirect, render } from "../../utils/response";
import { stateHelpers } from "../../utils/state";

const { getFlash, setFlash } = stateHelpers<ListsState>();

const setDtos = SETS.map((s) => ({
  code: s.code,
  name: s.name,
  count: s.count,
}));

const toBuilderItems = (
  cards: ListCardRow[],
): { card: BuilderCard; quantity: number }[] =>
  cards.map((c) => ({
    card: {
      id: c.card.id,
      name: c.card.name,
      set: c.card.set,
      number: c.card.number,
      rarity: c.card.rarity,
      ex: c.card.ex,
    },
    quantity: c.quantity,
  }));

interface BuilderCard {
  id: string;
  name: string;
  set: string;
  number: number;
  rarity: string;
  ex: boolean;
}

export const lists = {
  async index(req: BunRequest): Promise<Response> {
    const authRedirect = await requireAuth(req);
    if (authRedirect) return authRedirect;

    const ctx = await getSessionContext(req);
    if (!ctx.user || !ctx.sessionId) return redirect("/login");

    const summaries = await getListsByUser(ctx.user.id);
    const logoutCsrf = await createCsrfToken(
      ctx.sessionId,
      "POST",
      "/auth/logout",
    );

    const deleteCsrfTokens: Record<string, string> = {};
    const duplicateCsrfTokens: Record<string, string> = {};
    for (const l of summaries) {
      deleteCsrfTokens[l.slug] = await createCsrfToken(
        ctx.sessionId,
        "POST",
        `/lists/${l.slug}/delete`,
      );
      duplicateCsrfTokens[l.slug] = await createCsrfToken(
        ctx.sessionId,
        "POST",
        `/lists/${l.slug}/duplicate`,
      );
    }

    const accountCsrf = ctx.user.display_name
      ? undefined
      : await createCsrfToken(ctx.sessionId, "POST", "/account");

    return render(
      <Lists
        lists={summaries}
        user={ctx.user}
        logoutCsrf={logoutCsrf}
        deleteCsrfTokens={deleteCsrfTokens}
        duplicateCsrfTokens={duplicateCsrfTokens}
        accountCsrf={accountCsrf}
        state={getFlash(req)}
      />,
    );
  },

  async edit(req: SlugRequest): Promise<Response> {
    const authRedirect = await requireAuth(req);
    if (authRedirect) return authRedirect;

    const ctx = await getSessionContext(req);
    if (!ctx.user || !ctx.sessionId) return redirect("/login");

    const { slug } = req.params;
    const list = await getTradeListBySlug(slug);
    if (!list || list.userId !== ctx.user.id) {
      return redirect("/lists");
    }

    const editToken = await createCsrfToken(
      ctx.sessionId,
      "PUT",
      `/api/lists/${slug}`,
    );
    const logoutCsrf = await createCsrfToken(
      ctx.sessionId,
      "POST",
      "/auth/logout",
    );

    return render(
      <BuilderPage
        config={{
          sets: setDtos,
          csrfToken: editToken,
          mode: "edit",
          slug,
          initial: {
            wants: toBuilderItems(list.wants),
            haves: toBuilderItems(list.haves),
            friendId: list.friendId ?? "",
            title: list.title ?? "",
          },
          account: { displayName: ctx.user.display_name ?? "" },
        }}
        heading="Edit your list"
        sub="Change your cards or friend ID and save. The link and its Discord unfurl update in place."
        user={ctx.user}
        csrfToken={logoutCsrf}
      />,
    );
  },

  // Copy a list into a new one. Lands back on /lists — the copy is the newest
  // row, and the flash links straight to editing it.
  async duplicate(req: SlugRequest): Promise<Response> {
    const authRedirect = await requireAuth(req);
    if (authRedirect) return authRedirect;

    const ctx = await getSessionContext(req);
    if (!ctx.user) return redirect("/login");

    const { slug } = req.params;
    const csrf = await csrfProtection(req, {
      method: "POST",
      path: `/lists/${slug}/duplicate`,
    });
    if (csrf) return csrf;

    const result = await duplicateList(slug, ctx.user.id);
    // Gone or not theirs — same silent bounce as trying to edit someone
    // else's list.
    if (!result) return redirect("/lists");

    if (!result.ok) {
      setFlash(req, { state: "error", error: result.error });
      return redirect("/lists");
    }

    setFlash(req, {
      state: "copied",
      slug: result.list.slug,
      title: result.list.title,
    });
    return redirect("/lists");
  },

  async destroy(req: SlugRequest): Promise<Response> {
    const authRedirect = await requireAuth(req);
    if (authRedirect) return authRedirect;

    const ctx = await getSessionContext(req);
    if (!ctx.user) return redirect("/login");

    const { slug } = req.params;
    const csrf = await csrfProtection(req, {
      method: "POST",
      path: `/lists/${slug}/delete`,
    });
    if (csrf) return csrf;

    await deleteList(slug, ctx.user.id);
    return redirect("/lists");
  },
};
