import { NextResponse, type NextRequest } from "next/server";

// Lightweight edge guard — `middleware.ts` in Next.js 15, renamed to `proxy.ts`
// in Next.js 16. Blocks unauthenticated access to app routes by cookie presence.
// Full JWT verification + tenant checks happen server-side in each route via
// requireUser()/requirePermission().
//
// It also stamps every request with a correlation id and its path/method so the
// audit service can attribute entries without each caller passing them down.
// Rotas que não dependem da sessão da aplicação. `/api/patient`,
// `/api/public/booking` e `/fhir` autenticam-se com token próprio (Bearer),
// verificado dentro de cada handler.
const PUBLIC = ["/login", "/recuperar-senha", "/sem-acesso", "/api/patient", "/api/public/booking", "/fhir"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("pulso_session");

  if (!hasSession && !PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    // Um cliente de API deve receber 401 JSON, não uma página de login em HTML.
    // A protecção é a mesma: os handlers revalidam a sessão de qualquer forma.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Sessão inválida." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", req.headers.get("x-request-id") ?? crypto.randomUUID());
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("x-http-method", req.method);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-request-id", requestHeaders.get("x-request-id")!);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}

export const config = {
  // Run on everything except Next internals, static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
