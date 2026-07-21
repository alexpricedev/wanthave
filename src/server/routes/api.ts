import { cardsApi, listsApi, statsApi } from "../controllers/api";
import { createRouteHandler } from "../utils/route-handler";

export const apiRoutes = {
  "/api/stats": statsApi.index,
  "/api/cards": cardsApi.index,
  "/api/cards/search": cardsApi.search,
  "/api/lists": createRouteHandler({ POST: listsApi.create }),
  "/api/lists/:slug": createRouteHandler({
    PUT: listsApi.update<"/api/lists/:slug">,
  }),
};
