import { initializePage, registerPage } from "@client/page-lifecycle";
import { cleanup as cleanupList, init as initList } from "@client/pages/list";
import {
  cleanup as cleanupLists,
  init as initLists,
} from "@client/pages/lists";
import { init as initNew } from "@client/pages/new";

registerPage("new", { init: initNew });
registerPage("list", { init: initList, cleanup: cleanupList });
registerPage("lists", { init: initLists, cleanup: cleanupLists });

initializePage(document.body.dataset.page);
