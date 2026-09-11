import { redirect } from "next/navigation";
import { auth } from "@/auth";

export type SessionUser = { id: string; email?: string | null; name?: string | null };

/** Server components / actions: get the signed-in user or bounce to /login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}
