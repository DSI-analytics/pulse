import { z } from "zod";
import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { saveDoctorMobileConsultation } from "@/server/doctor-mobile";

const nullableText = z.string().max(10_000).nullable().optional();
const schema = z.object({
  subjective: nullableText,
  notes: nullableText,
  prescription: nullableText,
  recommendations: nullableText,
  followUpDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional(),
  diagnoses: z.array(z.object({
    code: z.string().trim().min(2).max(12),
    title: z.string().trim().max(500).optional(),
    uri: z.string().trim().max(400).optional(),
    release: z.string().trim().max(32).optional(),
    kind: z.enum(["PRINCIPAL", "SECUNDARIO", "DIFERENCIAL"]).optional(),
    certainty: z.enum(["PROVISORIO", "CONFIRMADO"]).optional(),
  })).max(20).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateMobileJson({ error: "Dados clínicos inválidos." }, { status: 400 });
  const { id } = await params;
  const result = await saveDoctorMobileConsultation(
    context,
    id,
    { ...parsed.data, followUpDate: parsed.data.followUpDate || null },
    true,
  );
  return privateMobileJson(result, { status: "error" in result ? 409 : 200 });
}
