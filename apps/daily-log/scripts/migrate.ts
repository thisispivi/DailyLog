import { getDatabase } from "@/infrastructure/database/client";

const database = getDatabase();
const version = database.pragma("user_version", { simple: true }) as number;
console.info(`DailyLog database is ready at schema version ${version}.`);
