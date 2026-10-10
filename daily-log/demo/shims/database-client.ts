import { getDemoDatabase } from "@demo/shell/database";

export { migrateDatabase } from "@/infrastructure/database/schema";

export const getDatabase = getDemoDatabase;
