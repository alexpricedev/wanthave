import {
  cardImage,
  home,
  list,
  lists,
  llmsTxt,
  newList,
  robotsTxt,
  securityTxt,
  sitemap,
  webmanifest,
} from "../controllers/app";
import { callback, login, logout } from "../controllers/auth";
import { createRouteHandler } from "../utils/route-handler";

export const appRoutes = {
  "/": home.index,
  "/new": newList.index,
  "/lists": createRouteHandler({ GET: lists.index }),
  "/lists/:slug/edit": lists.edit<"/lists/:slug/edit">,
  "/lists/:slug/delete": createRouteHandler({
    POST: lists.destroy<"/lists/:slug/delete">,
  }),
  "/l/:slug": list.index<"/l/:slug">,
  "/l/:slug/og.png": list.og<"/l/:slug/og.png">,
  "/img/card/:id": cardImage.show<"/img/card/:id">,
  "/robots.txt": robotsTxt.index,
  "/site.webmanifest": webmanifest.index,
  "/sitemap.xml": sitemap.index,
  "/llms.txt": llmsTxt.index,
  "/.well-known/security.txt": securityTxt.index,
  "/login": createRouteHandler({
    GET: login.index,
    POST: login.create,
  }),
  "/auth/callback": callback.index,
  "/auth/logout": createRouteHandler({
    POST: logout.create,
  }),
};
