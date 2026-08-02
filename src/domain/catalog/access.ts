import "server-only";

import { demoCatalogAccess } from "./demoAccess";
import { createPostgresCatalogAccess } from "./postgresAccess";
import type { CatalogAccess } from "./repository";

export function getCatalogAccess(): CatalogAccess {
  if (process.env.DATABASE_URL) {
    return createPostgresCatalogAccess();
  }

  return demoCatalogAccess;
}
