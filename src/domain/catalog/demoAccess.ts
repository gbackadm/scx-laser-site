import { createDemoCatalogAccess } from "./repository";
import {
  demoAuditLog,
  demoCatalogProducts,
  demoCategories,
  demoSupplierProducts,
  demoSyncRuns,
  demoUsers,
} from "./demoData";

export const demoCatalogAccess = createDemoCatalogAccess({
  catalogProducts: demoCatalogProducts,
  supplierProducts: demoSupplierProducts,
  categories: demoCategories,
  users: demoUsers,
  auditLog: demoAuditLog,
  syncRuns: demoSyncRuns,
});
