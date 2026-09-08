// Emite (ou roda) o token do canal público de marcação usado pelo website
// institucional. O token é mostrado uma única vez — na base fica só o hash.
//
//   node scripts/create-website-api-token.mjs [clinicSlug] [clientName]
//
// Exemplo:
//   node scripts/create-website-api-token.mjs clinica-marianu "Website LenMed"

import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [clinicSlug = "clinica-marianu", clientName = "Website LenMed"] = process.argv.slice(2);
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");

// Só o necessário para o formulário público: ler o catálogo e a
// disponibilidade, criar a marcação. Nada de leitura de pacientes.
const scopes = ["system/Appointment.read", "system/Appointment.write"];

try {
  const clinic = await prisma.clinic.findUnique({ where: { slug: clinicSlug }, select: { id: true, name: true } });
  if (!clinic) {
    const all = await prisma.clinic.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } });
    throw new Error(
      `Clínica "${clinicSlug}" não encontrada. Disponíveis: ${all.map((c) => `${c.slug} (${c.name})`).join(", ") || "nenhuma"}.`,
    );
  }

  await prisma.apiClient.upsert({
    where: { clinicId_name: { clinicId: clinic.id, name: clientName } },
    create: { clinicId: clinic.id, name: clientName, tokenHash, scopes, isActive: true },
    update: { tokenHash, scopes, isActive: true, expiresAt: null },
  });

  console.log(`Clínica: ${clinic.name} (${clinicSlug})`);
  console.log(`Cliente: ${clientName}`);
  console.log(`Scopes:  ${scopes.join(" ")}`);
  console.log("");
  console.log("Coloque no .env do website (Website/.env.local):");
  console.log(`PULSO_API_TOKEN=${token}`);
} finally {
  await prisma.$disconnect();
}
