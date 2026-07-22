import { initializePage, registerPage } from "@client/page-lifecycle";
import { cleanup as cleanupList, init as initList } from "@client/pages/list";
import { init as initNew } from "@client/pages/new";

registerPage("new", { init: initNew });
registerPage("list", { init: initList, cleanup: cleanupList });

initializePage(document.body.dataset.page);
