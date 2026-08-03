import type { BunRequest } from "bun";
import { getSessionContext, requireAuth } from "../../middleware/auth";
import { csrfProtection } from "../../middleware/csrf";
import { SETS } from "../../services/cards";
import { createCsrfToken } from "../../services/csrf";
import {
  deleteList,
  getListsByUser,
  getTradeListBySlug,
  type ListCardRow,
} from "../../services/lists";
import { BuilderPage } from "../../templates/builder";
import { Lists } from "../../templates/lists";
import { redirect, render } from "../../utils/response";

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
    for (const l of summaries) {
      deleteCsrfTokens[l.slug] = await createCsrfToken(
        ctx.sessionId,
        "POST",
        `/lists/${l.slug}/delete`,
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
        accountCsrf={accountCsrf}
      />,
    );
  },

  async edit<T extends `${string}:slug${string}`>(
    req: BunRequest<T>,
  ): Promise<Response> {
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

  async destroy<T extends `${string}:slug${string}`>(
    req: BunRequest<T>,
  ): Promise<Response> {
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
