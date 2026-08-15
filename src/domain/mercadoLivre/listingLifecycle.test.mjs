import test from "node:test";
import assert from "node:assert/strict";

import { canActivateListing, deletionRequiresClose } from "./listingLifecycle.js";

test("reativa apenas pausas que dependem da decisao do vendedor", () => {
  assert.equal(canActivateListing("paused", ["paused_by_seller"]), true);
  assert.equal(canActivateListing("paused", []), true);
  assert.equal(canActivateListing("paused", ["out_of_stock"]), false);
  assert.equal(canActivateListing("paused", ["picture_download_pending"]), false);
  assert.equal(canActivateListing("active", []), false);
});

test("exclusao encerra primeiro, exceto item encerrado ou proibido", () => {
  assert.equal(deletionRequiresClose("active", []), true);
  assert.equal(deletionRequiresClose("paused", []), true);
  assert.equal(deletionRequiresClose("closed", []), false);
  assert.equal(deletionRequiresClose("under_review", ["forbidden"]), false);
});
