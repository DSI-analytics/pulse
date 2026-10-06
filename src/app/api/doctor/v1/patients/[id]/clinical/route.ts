import { z } from "zod";
import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import {
  addDoctorMobileAllergy,
  addDoctorMobileDiagnosis,
  addDoctorMobileProcedure,
  addDoctorMobileTreatment,
  createDoctorMobileAdmission,
  createDoctorMobileDiagnosticOrder,
  createDoctorMobilePrescription,
  recordDoctorMobileVitals,
} from "@/server/doctor-mobile-clinical";

const envelope = z.object({
  action: z.enum(["vitals", "allergy", "diagnosis", "prescription", "diagnosticOrder", "procedure", "treatment", "admission"]),
  data: z.unknown(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const parsed = envelope.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateMobileJson({ error: "Ação clínica inválida." }, { status: 400 });
  const { id } = await params;
  const result = await (async () => {
    switch (parsed.data.action) {
      case "vitals": return recordDoctorMobileVitals(context, id, parsed.data.data);
      case "allergy": return addDoctorMobileAllergy(context, id, parsed.data.data);
      case "diagnosis": return addDoctorMobileDiagnosis(context, id, parsed.data.data);
      case "prescription": return createDoctorMobilePrescription(context, id, parsed.data.data);
      case "diagnosticOrder": return createDoctorMobileDiagnosticOrder(context, id, parsed.data.data);
      case "procedure": return addDoctorMobileProcedure(context, id, parsed.data.data);
      case "treatment": return addDoctorMobileTreatment(context, id, parsed.data.data);
      case "admission": return createDoctorMobileAdmission(context, id, parsed.data.data);
    }
  })();
  return privateMobileJson(result, { status: "error" in result ? 409 : 200 });
}
