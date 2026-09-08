import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [patientCode = "PAC-00001", suppliedToken, clinicSlug = "clinica-marianu"] = process.argv.slice(2);
const token = suppliedToken || randomBytes(32).toString("base64url");

try {
  const patient = await prisma.patient.findFirst({
    where: { code: patientCode, clinic: { slug: clinicSlug } },
    select: { id: true, clinicId: true, name: true },
  });
  if (!patient) throw new Error(`Paciente ${patientCode} não encontrado na clínica ${clinicSlug}.`);

  await prisma.patientPortalAccess.upsert({
    where: { patientId: patient.id },
    create: {
      clinicId: patient.clinicId,
      patientId: patient.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    },
    update: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      isActive: true,
      expiresAt: null,
    },
  });

  console.log(`Paciente: ${patient.name} (${patientCode})`);
  console.log(`PATIENT_API_TOKEN=${token}`);
} finally {
  await prisma.$disconnect();
}
