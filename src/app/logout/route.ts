import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { destroySession, getSession } from "@/lib/auth";

// GET /logout — clears the session and returns to the login screen.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (session) {
    await audit({
      clinicId: session.clinicId,
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      sessionId: session.sessionId ?? null,
      action: "auth.logout",
      module: "autenticacao",
      entity: "User",
      entityId: session.userId,
    });
  }
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url));
}
