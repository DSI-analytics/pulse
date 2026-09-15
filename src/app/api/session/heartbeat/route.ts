import { createSession, getAuthorizedUser } from "@/lib/auth";

/** Renews the short-lived session only while the signed-in UI reports activity. */
export async function POST() {
  const user = await getAuthorizedUser();
  if (!user) {
    return Response.json(
      { error: "Sessão inválida." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  await createSession(user);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
