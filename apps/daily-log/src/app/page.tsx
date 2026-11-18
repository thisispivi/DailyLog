import { redirect } from "next/navigation";

import { readSession } from "@/core/security/session";

export default async function HomePage() {
    redirect((await readSession()) ? "/today" : "/login");
}
