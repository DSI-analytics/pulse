import { consume } from "@/lib/rate-limit";
import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { searchIcd } from "@/server/icd11";

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const gate = consume(`doctor-mobile-icd11:${context.userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!gate.allowed) {
    return privateMobileJson(
      { error: "Muitas pesquisas CID-11. Aguarde alguns segundos." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } },
    );
  }
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchIcd(query, "pt");
  return privateMobileJson(result, { status: "error" in result ? 400 : 200 });
}
