import { NextResponse, type NextRequest } from "next/server";

// Lightweight edge guard: block unauthenticated access to app routes by cookie
// presence. Full JWT verification + tenant checks happen server-side in each
// route via requireUser()/requirePermission().
const PUBLIC = ["/login", "/sem-acesso"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("pulso_session");

  if (!hasSession && !PUBLIC.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
