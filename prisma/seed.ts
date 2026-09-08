/**
 * Pulso — demo seed for a private clinic in Maputo (Clínica Marianu).
 * Generates a realistic operational + financial dataset over ~3 months.
 *
 *   npm run db:seed
 */
import { AppointmentStatus, PrismaClient, Prisma, RevenueSource, UserRole } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── deterministic RNG (reproducible seeds) ───────────────────────────────────
let _s = 20260813;
const rand = () => {
  _s = (_s * 1103515245 + 12345) & 0x7fffffff;
  return _s / 0x7fffffff;
};
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;

const MZN = (v: number) => Math.round(v * 100); // MZN -> centavos

// ── name pools (Mozambican) ──────────────────────────────────────────────────
const FIRST_M = ["João","Carlos","Paulo","Manuel","António","Ussene","Jorge","Fernando","Nelson","Ivan","Aderito","Bento","Rogério","Salomão","Custódio","Elias","Gil","Hélder","Inácio","Zeca"];
const FIRST_F = ["Marta","Ana","Sofia","Isabel","Luísa","Fátima","Celeste","Beatriz","Rosa","Amina","Judite","Teresa","Verónica","Wania","Xelita","Yolanda","Zaida","Carmen","Dércia","Ercília"];
const LAST = ["Machava","Cossa","Tembe","Mabjaia","Sitoe","Nhaca","Chissano","Mondlane","Guebuza","Matsinhe","Bila","Langa","Zandamela","Muianga","Chirindza","Fumo","Macuácua","Nhantumbo","Simango","Uamusse","Come","Banze"];

const fullName = (f: boolean) => `${pick(f ? FIRST_F : FIRST_M)} ${pick(LAST)}`;

async function main() {
  console.log("› A limpar dados anteriores…");

  // O trigger `audit_log_append_only` rejeita DELETE em "AuditLog" — é essa a
  // garantia de imutabilidade. TRUNCATE não dispara triggers de linha e exige
  // privilégio de dono da tabela, pelo que continua a não existir nenhum
  // caminho da aplicação capaz de apagar o rasto: só esta ferramenta de
  // reposição de ambiente de desenvolvimento.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');

  // Order matters (FKs). Cascades handle most, but be explicit for clarity.
  await prisma.$transaction([
    prisma.fhirResource.deleteMany(),
    prisma.apiClient.deleteMany(),
    prisma.loginAttempt.deleteMany(),
    prisma.clinicalAttachment.deleteMany(),
    prisma.diagnosticResultItem.deleteMany(),
    prisma.diagnosticResult.deleteMany(),
    prisma.diagnosticOrder.deleteMany(),
    prisma.prescriptionItem.deleteMany(),
    prisma.prescription.deleteMany(),
    prisma.medication.deleteMany(),
    prisma.clinicalProcedure.deleteMany(),
    prisma.treatment.deleteMany(),
    prisma.admission.deleteMany(),
    prisma.vitalSign.deleteMany(),
    prisma.diagnosis.deleteMany(),
    prisma.allergy.deleteMany(),
    prisma.patientIdentityDocument.deleteMany(),
    prisma.userClinicAccess.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.revenue.deleteMany(),
    prisma.consultation.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.encounter.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.expenseCategory.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.inventoryCategory.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.patientPortalAccess.deleteMany(),
    prisma.patientHealthPlan.deleteMany(),
    prisma.doctorHealthPlan.deleteMany(),
    prisma.doctorAvailabilityException.deleteMany(),
    prisma.doctorSchedule.deleteMany(),
    prisma.service.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.doctor.deleteMany(),
    prisma.healthPlan.deleteMany(),
    prisma.healthInsuranceCompany.deleteMany(),
    prisma.specialty.deleteMany(),
    prisma.user.deleteMany(),
    prisma.role.deleteMany(),
    prisma.clinicSettings.deleteMany(),
    prisma.branch.deleteMany(),
    prisma.clinic.deleteMany(),
    prisma.permission.deleteMany(),
  ]);

  // ── Clinic ──────────────────────────────────────────────────────────────
  console.log("› Clínica, definições e filial…");
  const clinic = await prisma.clinic.create({
    data: {
      // Stable id so re-seeding during development does not invalidate sessions.
      id: "clnpulsodemo0000000000001",
      name: "Clínica Marianu",
      slug: "clinica-marianu",
      nuit: "400123456",
      phone: "+258 21 300 400",
      email: "geral@clinicamarianu.mz",
      address: "Av. Julius Nyerere, 1120",
      city: "Maputo",
    },
  });
  const clinicId = clinic.id;
  await prisma.clinicSettings.create({ data: { clinicId } });
  const branch = await prisma.branch.create({
    data: { clinicId, name: "Sede — Polana", address: "Av. Julius Nyerere, 1120", isMain: true },
  });

  // ── Users ───────────────────────────────────────────────────────────────
  console.log("› Utilizadores…");
  const pass = bcrypt.hashSync("pulso123", 10);
  const mkUser = (name: string, email: string, role: UserRole) =>
    prisma.user.create({ data: { clinicId, name, email, passwordHash: pass, role } });
  const admin = await mkUser("Dra. Marina Uamusse", "admin@clinicamarianu.mz", "CLINIC_ADMIN");
  await mkUser("Cátia Sousa", "rececao@clinicamarianu.mz", "RECEPTIONIST");
  const medicoUser = await mkUser("Dr. Rui Machava", "medico@clinicamarianu.mz", "DOCTOR");
  await mkUser("Elton Cossa", "financeiro@clinicamarianu.mz", "FINANCE");
  await mkUser("Nádia Tembe", "stock@clinicamarianu.mz", "INVENTORY_MANAGER");
  await mkUser("Enf. Célia Bila", "enfermagem@clinicamarianu.mz", "NURSE");
  await mkUser("Hélder Nhaca", "laboratorio@clinicamarianu.mz", "LAB_TECHNICIAN");

  // Gestor da Clínica: Insights da sua instituição, sem privilégios
  // administrativos. O acesso institucional é explícito (UserClinicAccess).
  const gestor = await mkUser("Sérgio Bila", "gestor@clinicamarianu.mz", "CLINIC_MANAGER");
  await prisma.userClinicAccess.create({ data: { userId: gestor.id, clinicId } });

  // ── Specialties ─────────────────────────────────────────────────────────
  console.log("› Especialidades…");
  const specDefs = [
    { name: "Medicina Geral", color: "#0C7C74", price: 1500 },
    { name: "Pediatria", color: "#2563a8", price: 1800 },
    { name: "Cardiologia", color: "#cb4133", price: 3000 },
    { name: "Ginecologia", color: "#8a4fbf", price: 2500 },
    { name: "Dermatologia", color: "#b26a06", price: 2200 },
    { name: "Oftalmologia", color: "#1f9d57", price: 2400 },
    { name: "Dentária", color: "#0891a5", price: 2000 },
  ];
  const specialties = await Promise.all(
    specDefs.map((s) =>
      prisma.specialty.create({ data: { clinicId, name: s.name, color: s.color } }),
    ),
  );
  const specById = Object.fromEntries(specialties.map((s, i) => [s.name, { ...s, price: specDefs[i].price }]));

  // ── Insurance & plans ─────────────────────────────────────────────────────
  console.log("› Seguradoras e planos…");
  const insurerDefs = [
    { name: "MEDIPLUS", term: 45, plans: [{ n: "Executivo", price: 2000, copay: 200 }, { n: "Base", price: 1400, copay: 300 }] },
    { name: "Hollard Saúde", term: 30, plans: [{ n: "Premium", price: 2200, copay: 150 }, { n: "Clássico", price: 1500, copay: 250 }] },
    { name: "Global Alliance", term: 60, plans: [{ n: "Corporate", price: 1800, copay: 0 }] },
    { name: "ICM Saúde", term: 30, plans: [{ n: "Família", price: 1300, copay: 400 }] },
  ];
  const plans: { id: string; contractPrice: number; copay: number }[] = [];
  for (const ins of insurerDefs) {
    const company = await prisma.healthInsuranceCompany.create({
      data: { clinicId, name: ins.name, paymentTermDays: ins.term, phone: "+258 84 000 0000" },
    });
    for (const p of ins.plans) {
      const plan = await prisma.healthPlan.create({
        data: {
          clinicId,
          insuranceCompanyId: company.id,
          name: p.n,
          contractPrice: MZN(p.price),
          patientCopay: MZN(p.copay),
        },
      });
      plans.push({ id: plan.id, contractPrice: MZN(p.price), copay: MZN(p.copay) });
    }
  }

  // ── Services & exams (price list used by marcações) ─────────────────────
  console.log("› Serviços e exames…");
  const serviceDefs = [
    { n: "Consulta de Medicina Geral", c: "Consultas", s: "CONSULTA", p: 1500 },
    { n: "Consulta de especialidade", c: "Consultas", s: "CONSULTA", p: 2500 },
    { n: "Hemograma completo", c: "Análises clínicas", s: "EXAME", p: 1200 },
    { n: "Glicemia em jejum", c: "Análises clínicas", s: "EXAME", p: 450 },
    { n: "Teste rápido de malária", c: "Análises clínicas", s: "EXAME", p: 350 },
    { n: "Análise de urina II", c: "Análises clínicas", s: "EXAME", p: 600 },
    { n: "Perfil lipídico", c: "Análises clínicas", s: "EXAME", p: 1800 },
    { n: "Raio-X do tórax", c: "Imagiologia", s: "EXAME", p: 2200 },
    { n: "Ecografia abdominal", c: "Imagiologia", s: "EXAME", p: 3000 },
    { n: "Ecografia obstétrica", c: "Imagiologia", s: "EXAME", p: 3200 },
    { n: "Electrocardiograma (ECG)", c: "Cardiologia", s: "EXAME", p: 2000 },
    { n: "Teste de esforço", c: "Cardiologia", s: "EXAME", p: 4500 },
    { n: "Papanicolau", c: "Ginecologia", s: "EXAME", p: 1600 },
    { n: "Sutura simples", c: "Pequena cirurgia", s: "PROCEDIMENTO", p: 2500 },
    { n: "Penso e curativo", c: "Enfermagem", s: "PROCEDIMENTO", p: 500 },
    { n: "Administração de injectável", c: "Enfermagem", s: "PROCEDIMENTO", p: 350 },
    { n: "Nebulização", c: "Enfermagem", s: "PROCEDIMENTO", p: 700 },
    { n: "Destartarização dentária", c: "Dentária", s: "PROCEDIMENTO", p: 3500 },
    { n: "Extracção dentária simples", c: "Dentária", s: "PROCEDIMENTO", p: 2800 },
  ];
  await prisma.service.createMany({
    data: serviceDefs.map((s) => ({
      clinicId, name: s.n, category: s.c, source: s.s as RevenueSource, basePrice: MZN(s.p),
    })),
  });

  // ── Doctors ────────────────────────────────────────────────────────────
  console.log("› Médicos, horários e planos aceites…");
  const doctorDefs = [
    { name: "Dra. Marta Sitoe", spec: "Cardiologia", target: 0.92 },
    { name: "Dr. Rui Machava", spec: "Medicina Geral", target: 0.86, user: medicoUser.id },
    { name: "Dr. Carlos Nhaca", spec: "Ortopedia?", target: 0.54 },
    { name: "Dra. Sofia Mondlane", spec: "Pediatria", target: 0.78 },
    { name: "Dr. Paulo Langa", spec: "Dermatologia", target: 0.62 },
    { name: "Dra. Beatriz Cossa", spec: "Ginecologia", target: 0.81 },
    { name: "Dr. António Bila", spec: "Oftalmologia", target: 0.7 },
    { name: "Dra. Amina Fumo", spec: "Dentária", target: 0.75 },
    { name: "Dr. Nelson Guebuza", spec: "Medicina Geral", target: 0.68 },
    { name: "Dra. Judite Simango", spec: "Pediatria", target: 0.58 },
  ];
  const doctors: {
    id: string; name: string; specId: string; price: number; duration: number; target: number;
  }[] = [];
  for (const d of doctorDefs) {
    const specName = specById[d.spec] ? d.spec : "Medicina Geral";
    const spec = specById[specName];
    const duration = specName === "Cardiologia" || specName === "Ginecologia" ? 30 : 30;
    const price = MZN(spec.price);
    const doc = await prisma.doctor.create({
      data: {
        clinicId,
        branchId: branch.id,
        userId: d.user ?? undefined,
        specialtyId: spec.id,
        name: d.name,
        phone: "+258 84 " + int(100, 999) + " " + int(1000, 9999),
        email: d.name.toLowerCase().replace(/[^a-z]/g, ".").slice(0, 14) + "@clinicamarianu.mz",
        licenseNumber: "OMM-" + int(10000, 99999),
        consultationPrice: price,
        consultationDuration: duration,
      },
    });
    // Mon–Fri 08:00–16:00, lunch 12:30–13:30
    await prisma.doctorSchedule.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        doctorId: doc.id,
        weekday,
        startTime: "08:00",
        endTime: "16:00",
        breakStart: "12:30",
        breakEnd: "13:30",
        slotMinutes: duration,
      })),
    });
    // accept a random subset of plans
    const accepted = plans.filter(() => chance(0.7));
    await prisma.doctorHealthPlan.createMany({
      data: accepted.map((p) => ({ doctorId: doc.id, healthPlanId: p.id })),
      skipDuplicates: true,
    });
    doctors.push({ id: doc.id, name: d.name, specId: spec.id, price, duration, target: d.target });
  }

  // ── Patients ───────────────────────────────────────────────────────────
  console.log("› 300 pacientes…");
  const patients: { id: string; planId: string | null; copay: number }[] = [];
  const patientRows: Prisma.PatientCreateManyInput[] = [];
  const phpRows = [];
  for (let i = 1; i <= 300; i++) {
    const female = chance(0.55);
    const id = randomUUID();
    const birthYear = int(1955, 2020);
    patientRows.push({
      id,
      clinicId,
      code: `PAC-${String(i).padStart(5, "0")}`,
      name: fullName(female),
      gender: female ? "FEMININO" : "MASCULINO",
      birthDate: new Date(Date.UTC(birthYear, int(0, 11), int(1, 28))),
      phone: "+258 8" + int(2, 7) + " " + int(100, 999) + " " + int(1000, 9999),
      email: i === 1 ? "paciente@clinicamarianu.mz" : null,
      address: i === 1 ? "Maputo" : null,
      emergencyContactName: i === 1 ? "Contacto familiar" : null,
      emergencyContactPhone: i === 1 ? "+258 84 000 0000" : null,
      registeredAt: new Date(Date.now() - int(10, 900) * 86400000),
    });
    // ~55% have a health plan
    let planId: string | null = null;
    let copay = 0;
    if (chance(0.55)) {
      const p = pick(plans);
      planId = p.id;
      copay = p.copay;
      phpRows.push({
        id: randomUUID(),
        clinicId,
        patientId: id,
        healthPlanId: p.id,
        membershipNumber: "MB" + int(100000, 999999),
      });
    }
    patients.push({ id, planId, copay });
  }
  await prisma.patient.createMany({ data: patientRows });
  await prisma.patientHealthPlan.createMany({ data: phpRows });
  const demoPortalToken = "pulso-demo-patient-token-2026-rotate-me";
  await prisma.patientPortalAccess.create({
    data: {
      clinicId,
      patientId: patients[0].id,
      tokenHash: createHash("sha256").update(demoPortalToken).digest("hex"),
    },
  });

  // ── Suppliers ──────────────────────────────────────────────────────────
  console.log("› Fornecedores…");
  const supplierDefs = [
    { name: "Farmac Moçambique", cat: "Medicamentos", terms: "30 dias", lead: 5 },
    { name: "MedSupply Lda", cat: "Material clínico", terms: "45 dias", lead: 7 },
    { name: "LabTech Diagnóstica", cat: "Reagentes", terms: "30 dias", lead: 10 },
    { name: "Higiene Total", cat: "Limpeza", terms: "15 dias", lead: 3 },
    { name: "OfficePlus Maputo", cat: "Escritório", terms: "Pronto pagamento", lead: 2 },
  ];
  const suppliers = await Promise.all(
    supplierDefs.map((s) =>
      prisma.supplier.create({
        data: {
          clinicId, name: s.name, category: s.cat, paymentTerms: s.terms, avgLeadTimeDays: s.lead,
          contactName: fullName(chance(0.5)), phone: "+258 21 " + int(300, 900) + " " + int(100, 999),
          email: s.name.toLowerCase().replace(/[^a-z]/g, "") + "@fornecedor.mz",
        },
      }),
    ),
  );

  // ── Inventory ──────────────────────────────────────────────────────────
  console.log("› Categorias e artigos de stock…");
  const catNames = ["Consumíveis", "Medicamentos", "Reagentes", "Limpeza", "Escritório"];
  const cats = await Promise.all(
    catNames.map((name) => prisma.inventoryCategory.create({ data: { clinicId, name } })),
  );
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  const itemDefs = [
    { name: "Luvas de nitrilo tam. M", sku: "LUV-M", cat: "Consumíveis", unit: "caixa", stock: 4, min: 10, price: 850, cons: 1.2, sup: 1 },
    { name: "Luvas de nitrilo tam. L", sku: "LUV-L", cat: "Consumíveis", unit: "caixa", stock: 18, min: 8, price: 850, cons: 0.8, sup: 1 },
    { name: "Seringas 5ml", sku: "SER-5", cat: "Consumíveis", unit: "caixa", stock: 6, min: 12, price: 620, cons: 1.5, sup: 1 },
    { name: "Máscaras cirúrgicas", sku: "MSK-01", cat: "Consumíveis", unit: "caixa", stock: 22, min: 10, price: 480, cons: 1.0, sup: 1 },
    { name: "Álcool etílico 70% 1L", sku: "ALC-1L", cat: "Limpeza", unit: "un", stock: 14, min: 6, price: 320, cons: 0.5, sup: 3 },
    { name: "Reagente hemograma", sku: "REA-HG", cat: "Reagentes", unit: "kit", stock: 9, min: 4, price: 4200, cons: 0.3, sup: 2, expDays: 21 },
    { name: "Reagente glicose", sku: "REA-GL", cat: "Reagentes", unit: "kit", stock: 3, min: 4, price: 2800, cons: 0.4, sup: 2, expDays: 55 },
    { name: "Paracetamol 500mg", sku: "MED-PAR", cat: "Medicamentos", unit: "caixa", stock: 40, min: 15, price: 150, cons: 2.0, sup: 0, expDays: 200 },
    { name: "Amoxicilina 500mg", sku: "MED-AMX", cat: "Medicamentos", unit: "caixa", stock: 7, min: 10, price: 380, cons: 1.1, sup: 0, expDays: 120 },
    { name: "Compressas esterilizadas", sku: "COM-EST", cat: "Consumíveis", unit: "pacote", stock: 30, min: 12, price: 210, cons: 0.9, sup: 1 },
    { name: "Papel higiénico institucional", sku: "LIM-PH", cat: "Limpeza", unit: "fardo", stock: 11, min: 5, price: 540, cons: 0.4, sup: 3 },
    { name: "Toner impressora", sku: "OFC-TN", cat: "Escritório", unit: "un", stock: 2, min: 2, price: 3200, cons: 0.05, sup: 4 },
  ];
  const invItems: { id: string; sku: string }[] = [];
  for (const it of itemDefs) {
    const created = await prisma.inventoryItem.create({
      data: {
        clinicId,
        categoryId: catId[it.cat],
        supplierId: suppliers[it.sup].id,
        name: it.name,
        sku: it.sku,
        unit: it.unit,
        currentStock: it.stock,
        minStock: it.min,
        purchasePrice: MZN(it.price),
        avgCost: MZN(it.price),
        avgDailyConsumption: it.cons,
        expiryDate: it.expDays ? new Date(Date.now() + it.expDays * 86400000) : null,
        batchNumber: it.expDays ? "LOT-" + int(1000, 9999) : null,
        lastPurchaseAt: new Date(Date.now() - int(5, 40) * 86400000),
      },
    });
    invItems.push({ id: created.id, sku: it.sku });
  }

  // ── Purchases (received -> stock movements) ──────────────────────────────
  console.log("› Compras e movimentos de stock…");
  for (let i = 0; i < 8; i++) {
    const sup = pick(suppliers);
    const nItems = int(1, 3);
    const chosen = Array.from({ length: nItems }, () => pick(invItems));
    let total = 0;
    const itemsData = chosen.map((c) => {
      const qty = int(5, 30);
      const unit = MZN(int(150, 4000));
      total += qty * unit;
      return { itemId: c.id, quantity: qty, unitCost: unit, total: qty * unit };
    });
    const orderedAt = new Date(Date.now() - int(3, 80) * 86400000);
    const received = chance(0.8);
    const purchase = await prisma.purchase.create({
      data: {
        clinicId,
        supplierId: sup.id,
        invoiceNumber: "FT-" + int(1000, 9999),
        status: received ? "RECEBIDA" : "ENCOMENDADA",
        paymentStatus: chance(0.6) ? "PAGO" : "PENDENTE",
        total,
        orderedAt,
        receivedAt: received ? orderedAt : null,
        dueAt: new Date(orderedAt.getTime() + 30 * 86400000),
        items: { create: itemsData },
      },
    });
    if (received) {
      await prisma.inventoryMovement.createMany({
        data: itemsData.map((it) => ({
          clinicId, itemId: it.itemId, type: "ENTRADA" as const,
          quantity: it.quantity, unitCost: it.unitCost, purchaseId: purchase.id, reason: "Receção de compra",
        })),
      });
    }
  }

  // ── Expenses ───────────────────────────────────────────────────────────
  console.log("› Despesas…");
  const expCatNames = ["Salários", "Pagamentos a médicos", "Renda", "Água e luz", "Internet", "Material clínico", "Medicamentos", "Manutenção", "Limpeza", "Impostos"];
  const expCats = await Promise.all(
    expCatNames.map((name) => prisma.expenseCategory.create({ data: { clinicId, name } })),
  );
  const monthlyExpense: Record<string, number> = {
    "Salários": 380000, "Pagamentos a médicos": 620000, "Renda": 145000, "Água e luz": 42000,
    "Internet": 12000, "Material clínico": 88000, "Medicamentos": 64000, "Manutenção": 25000,
    "Limpeza": 18000, "Impostos": 95000,
  };
  const expenseRows: Prisma.ExpenseCreateManyInput[] = [];
  // Spread expenses weekly over the last ~13 weeks for a realistic cash outflow.
  for (let daysAgo = 91; daysAgo >= 0; daysAgo -= 7) {
    const when = new Date(Date.now() - daysAgo * 86400000);
    for (const c of expCats) {
      const weekly = (monthlyExpense[c.name] ?? 20000) / 4.345;
      expenseRows.push({
        clinicId, categoryId: c.id, description: c.name,
        amount: MZN(weekly * (0.85 + rand() * 0.3)),
        status: daysAgo < 7 && chance(0.3) ? "PENDENTE" : "PAGA",
        method: "TRANSFERENCIA", incurredAt: when,
      });
    }
  }
  await prisma.expense.createMany({ data: expenseRows });

  // ── Appointments across 3 months ─────────────────────────────────────────
  console.log("› Marcações, consultas, receitas e faturas (pode demorar)…");
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDay = new Date(today);
  startDay.setUTCDate(startDay.getUTCDate() - 75);
  const endDay = new Date(today);
  endDay.setUTCDate(endDay.getUTCDate() + 12);

  const apptRows: Prisma.AppointmentCreateManyInput[] = [];
  const consultRows: Prisma.ConsultationCreateManyInput[] = [];
  const revenueRows: Prisma.RevenueCreateManyInput[] = [];
  const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
  const invoiceItemRows: Prisma.InvoiceItemCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  let invoiceSeq = 1;

  const SLOTS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:30","14:00","14:30","15:00","15:30"];

  for (let d = new Date(startDay); d <= endDay; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue; // weekdays only
    const isPast = d < today;
    const isToday = d.getTime() === today.getTime();

    for (const doc of doctors) {
      // number of appointments ~ target occupancy of 13 slots
      const n = Math.round(SLOTS.length * doc.target * (0.8 + rand() * 0.4));
      const slots = [...SLOTS].sort(() => rand() - 0.5).slice(0, Math.min(n, SLOTS.length)).sort();
      for (const slot of slots) {
        const patient = pick(patients);
        const [hh, mm] = slot.split(":").map(Number);
        const startAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - 2, mm)); // Maputo +2 -> store UTC
        const endAt = new Date(startAt.getTime() + doc.duration * 60000);
        const usePlan = patient.planId && chance(0.85);
        const price = usePlan ? plans.find((p) => p.id === patient.planId)!.contractPrice : doc.price;
        const type = chance(0.25) ? "RETORNO" : "CONSULTA";

        // status distribution
        let status: AppointmentStatus;
        if (isPast) {
          const r = rand();
          status = r < 0.82 ? "CONCLUIDA" : r < 0.92 ? "NAO_COMPARECEU" : "CANCELADA";
        } else if (isToday) {
          const r = rand();
          status = r < 0.35 ? "CONCLUIDA" : r < 0.5 ? "EM_ESPERA" : r < 0.6 ? "EM_CONSULTA" : r < 0.72 ? "CHEGOU" : r < 0.9 ? "CONFIRMADA" : "MARCADA";
        } else {
          status = chance(0.6) ? "CONFIRMADA" : "MARCADA";
        }

        const apptId = randomUUID();
        apptRows.push({
          id: apptId, clinicId, branchId: branch.id, patientId: patient.id, doctorId: doc.id,
          specialtyId: doc.specId, type, status, startAt, endAt,
          isPrivate: !usePlan, healthPlanId: usePlan ? patient.planId : null,
          priceQuoted: price, createdById: admin.id,
          checkedInAt: ["CHEGOU","EM_ESPERA","EM_CONSULTA","CONCLUIDA"].includes(status) ? startAt : null,
        });

        if (status === "CONCLUIDA") {
          consultRows.push({
            clinicId, appointmentId: apptId, patientId: patient.id, doctorId: doc.id,
            startedAt: startAt, endedAt: endAt,
          });
          revenueRows.push({
            clinicId, source: usePlan ? "SEGURADORA" : "CONSULTA", description: "Consulta",
            amount: price, patientId: patient.id, doctorId: doc.id, specialtyId: doc.specId,
            healthPlanId: usePlan ? patient.planId : null, appointmentId: apptId,
            method: usePlan ? "SEGURADORA" : pick(["DINHEIRO","MPESA","EMOLA","CARTAO"]),
            status: usePlan ? "PENDENTE" : "PAGO", recognisedAt: endAt,
          });
          // invoice
          const invId = randomUUID();
          const patientDue = usePlan ? patient.copay : price;
          const insurerDue = usePlan ? Math.max(0, price - patient.copay) : 0;
          // insurer pays over time: ~55% settled
          const insurerPaid = usePlan ? (chance(0.55) ? insurerDue : 0) : 0;
          const amountPaid = patientDue + insurerPaid; // patient copay assumed paid at desk
          invoiceRows.push({
            id: invId, clinicId, number: `FAC-2026-${String(invoiceSeq++).padStart(6, "0")}`,
            patientId: patient.id, appointmentId: apptId, healthPlanId: usePlan ? patient.planId : null,
            status: amountPaid >= price ? "PAGA" : amountPaid > 0 ? "PARCIAL" : "EMITIDA",
            subtotal: price, total: price, patientDue, insurerDue, amountPaid,
            issuedAt: endAt, dueAt: new Date(endAt.getTime() + 45 * 86400000),
          });
          invoiceItemRows.push({
            id: randomUUID(), invoiceId: invId, description: "Consulta médica",
            quantity: 1, unitPrice: price, total: price,
          });
          if (patientDue > 0) {
            paymentRows.push({
              clinicId, invoiceId: invId, patientId: patient.id, amount: patientDue,
              method: pick(["DINHEIRO","MPESA","EMOLA","CARTAO"]), receivedAt: endAt,
            });
          }
          if (insurerPaid > 0) {
            paymentRows.push({
              clinicId, invoiceId: invId, patientId: patient.id, amount: insurerPaid,
              method: "TRANSFERENCIA", fromInsurer: true,
              receivedAt: new Date(endAt.getTime() + int(20, 50) * 86400000),
            });
          }
        }
      }
    }
  }

  console.log(`  ${apptRows.length} marcações, ${revenueRows.length} consultas concluídas`);
  // bulk insert in chunks
  const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const c of chunk(apptRows, 1000)) await prisma.appointment.createMany({ data: c });
  for (const c of chunk(consultRows, 1000)) await prisma.consultation.createMany({ data: c });
  for (const c of chunk(revenueRows, 1000)) await prisma.revenue.createMany({ data: c });
  for (const c of chunk(invoiceRows, 1000)) await prisma.invoice.createMany({ data: c });
  for (const c of chunk(invoiceItemRows, 1000)) await prisma.invoiceItem.createMany({ data: c });
  for (const c of chunk(paymentRows, 1000)) await prisma.payment.createMany({ data: c });

  // ── Prontuário clínico electrónico ────────────────────────────────────────
  // Dados inteiramente fictícios (§42): nenhum paciente real, nenhum registo
  // clínico real, nenhuma credencial real.
  console.log("› Prontuário clínico (episódios, alergias, prescrições, exames)…");

  const medicationDefs = [
    { name: "Amoxicilina 500 mg", activeIngredient: "Amoxicilina", form: "cápsula", strength: "500 mg" },
    { name: "Paracetamol 1 g", activeIngredient: "Paracetamol", form: "comprimido", strength: "1 g" },
    { name: "Ibuprofeno 400 mg", activeIngredient: "Ibuprofeno", form: "comprimido", strength: "400 mg" },
    { name: "Losartan 50 mg", activeIngredient: "Losartan", form: "comprimido", strength: "50 mg" },
    { name: "Metformina 850 mg", activeIngredient: "Metformina", form: "comprimido", strength: "850 mg" },
    { name: "Salbutamol inalador", activeIngredient: "Salbutamol", form: "inalador", strength: "100 mcg/dose" },
    { name: "Omeprazol 20 mg", activeIngredient: "Omeprazol", form: "cápsula", strength: "20 mg" },
    { name: "Artemeter + Lumefantrina", activeIngredient: "Artemeter", form: "comprimido", strength: "20/120 mg" },
  ];
  await prisma.medication.createMany({
    data: medicationDefs.map((m) => ({ clinicId, ...m, codeSystem: "interno" })),
  });
  const medications = await prisma.medication.findMany({ where: { clinicId }, select: { id: true, name: true, activeIngredient: true } });

  const allergyDefs = [
    { substance: "Penicilina", category: "MEDICAMENTO" as const, severity: "GRAVE" as const, reaction: "Urticária generalizada e edema" },
    { substance: "Sulfamidas", category: "MEDICAMENTO" as const, severity: "MODERADA" as const, reaction: "Erupção cutânea" },
    { substance: "Amendoim", category: "ALIMENTO" as const, severity: "GRAVE" as const, reaction: "Dificuldade respiratória" },
    { substance: "Pólen", category: "AMBIENTAL" as const, severity: "LEVE" as const, reaction: "Rinite" },
    { substance: "Lactose", category: "ALIMENTO" as const, severity: "LEVE" as const, reaction: "Desconforto abdominal" },
    { substance: "Ibuprofeno", category: "MEDICAMENTO" as const, severity: "MODERADA" as const, reaction: "Dor gástrica" },
  ];

  const diagnosisDefs = [
    { description: "Hipertensão essencial (primária)", code: "I10" },
    { description: "Diabetes mellitus tipo 2", code: "E11" },
    { description: "Infecção respiratória aguda", code: "J06" },
    { description: "Malária não complicada", code: "B54" },
    { description: "Gastrite", code: "K29" },
    { description: "Asma", code: "J45" },
    { description: "Anemia ferropénica", code: "D50" },
  ];

  const examDefs = [
    { name: "Hemograma completo", category: "LABORATORIO" as const, code: "58410-2" },
    { name: "Glicemia em jejum", category: "LABORATORIO" as const, code: "1558-6" },
    { name: "Teste rápido de malária", category: "LABORATORIO" as const, code: "70092-9" },
    { name: "Radiografia do tórax", category: "IMAGIOLOGIA" as const, code: "36643-5" },
    { name: "Ecografia abdominal", category: "IMAGIOLOGIA" as const, code: "24531-6" },
  ];

  const normaliseKey = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  // Alergias em ~18% dos pacientes.
  const allergyRows: Prisma.AllergyCreateManyInput[] = [];
  for (const patient of patients) {
    if (!chance(0.18)) continue;
    const def = pick(allergyDefs);
    allergyRows.push({
      clinicId,
      patientId: patient.id,
      substance: def.substance,
      substanceKey: normaliseKey(def.substance),
      category: def.category,
      kind: def.category === "ALIMENTO" && def.severity === "LEVE" ? "INTOLERANCIA" : "ALERGIA",
      reaction: def.reaction,
      severity: def.severity,
      status: "ACTIVA",
      identifiedAt: new Date(Date.now() - int(200, 2000) * 86400000),
      doctorId: pick(doctors).id,
    });
  }
  await prisma.allergy.createMany({ data: allergyRows, skipDuplicates: true });

  // Episódios clínicos construídos a partir das consultas já concluídas.
  const completed = consultRows.slice(0, Math.min(consultRows.length, 400));
  const encounterRows: Prisma.EncounterCreateManyInput[] = [];
  const vitalRows: Prisma.VitalSignCreateManyInput[] = [];
  const diagnosisRows: Prisma.DiagnosisCreateManyInput[] = [];
  const prescriptionRows: Prisma.PrescriptionCreateManyInput[] = [];
  const prescriptionItemRows: Prisma.PrescriptionItemCreateManyInput[] = [];
  const orderRows: Prisma.DiagnosticOrderCreateManyInput[] = [];
  const resultRows: Prisma.DiagnosticResultCreateManyInput[] = [];
  const resultItemRows: Prisma.DiagnosticResultItemCreateManyInput[] = [];

  let seq = 0;
  for (const consultation of completed) {
    seq += 1;
    const year = new Date(consultation.startedAt as Date).getUTCFullYear();
    const encounterId = randomUUID();
    encounterRows.push({
      id: encounterId,
      clinicId,
      branchId: branch.id,
      patientId: consultation.patientId as string,
      doctorId: consultation.doctorId as string,
      number: `EPI-${year}-${String(seq).padStart(5, "0")}`,
      type: "CONSULTA",
      status: "CONCLUIDO",
      startedAt: consultation.startedAt as Date,
      endedAt: (consultation.endedAt as Date) ?? (consultation.startedAt as Date),
      createdById: admin.id,
    });

    const weightKg = Math.round((50 + Math.random() * 45) * 10) / 10;
    const heightCm = Math.round(150 + Math.random() * 40);
    const metres = heightCm / 100;
    vitalRows.push({
      clinicId,
      patientId: consultation.patientId as string,
      encounterId,
      consultationId: consultation.id as string,
      recordedAt: consultation.startedAt as Date,
      recordedById: medicoUser.id,
      systolic: int(100, 165),
      diastolic: int(60, 100),
      heartRate: int(55, 105),
      respiratoryRate: int(12, 22),
      temperature: Math.round((36 + Math.random() * 2) * 10) / 10,
      oxygenSaturation: int(93, 100),
      weightKg,
      heightCm,
      bmi: Math.round((weightKg / (metres * metres)) * 10) / 10,
    });

    if (chance(0.8)) {
      const def = pick(diagnosisDefs);
      diagnosisRows.push({
        clinicId,
        patientId: consultation.patientId as string,
        encounterId,
        consultationId: consultation.id as string,
        kind: "PRINCIPAL",
        certainty: chance(0.7) ? "CONFIRMADO" : "PROVISORIO",
        code: def.code,
        codeSystem: "ICD-10",
        description: def.description,
        recordedAt: consultation.startedAt as Date,
        doctorId: consultation.doctorId as string,
        recordedById: medicoUser.id,
      });
    }

    if (chance(0.65)) {
      const prescriptionId = randomUUID();
      prescriptionRows.push({
        id: prescriptionId,
        clinicId,
        patientId: consultation.patientId as string,
        encounterId,
        consultationId: consultation.id as string,
        doctorId: consultation.doctorId as string,
        number: `REC-${year}-${String(seq).padStart(5, "0")}`,
        status: chance(0.35) ? "ACTIVA" : "CONCLUIDA",
        issuedAt: consultation.startedAt as Date,
        createdById: medicoUser.id,
      });
      for (let i = 0; i < int(1, 3); i += 1) {
        const med = pick(medications);
        prescriptionItemRows.push({
          prescriptionId,
          medicationId: med.id,
          medicationName: med.name,
          activeIngredient: med.activeIngredient,
          dose: pick(["1", "2", "500", "850"]),
          doseUnit: pick(["comprimido", "mg", "dose"]),
          route: "ORAL",
          frequency: pick(["8/8h", "12/12h", "1x/dia", "SOS"]),
          durationDays: pick([3, 5, 7, 14, 30]),
          instructions: pick(["Após as refeições", "Em jejum", "Com água", null]),
        });
      }
    }

    if (chance(0.35)) {
      const exam = pick(examDefs);
      const orderId = randomUUID();
      const concluded = chance(0.7);
      orderRows.push({
        id: orderId,
        clinicId,
        patientId: consultation.patientId as string,
        encounterId,
        consultationId: consultation.id as string,
        number: `PED-${year}-${String(seq).padStart(5, "0")}`,
        category: exam.category,
        name: exam.name,
        code: exam.code,
        codeSystem: "LOINC",
        priority: chance(0.15) ? "URGENTE" : "ROTINA",
        status: concluded ? "CONCLUIDO" : pick(["SOLICITADO", "AGENDADO", "EM_PROCESSAMENTO"]),
        requestedAt: consultation.startedAt as Date,
        doctorId: consultation.doctorId as string,
        requestedById: medicoUser.id,
      });

      if (concluded) {
        const resultId = randomUUID();
        const performedAt = new Date((consultation.startedAt as Date).getTime() + 86400000);
        resultRows.push({
          id: resultId,
          clinicId,
          orderId,
          performedAt,
          validatedAt: performedAt,
          conclusion: pick(["Sem alterações significativas.", "Valores dentro do intervalo de referência.", "Ligeira alteração — repetir em 30 dias."]),
        });
        const haemoglobin = Math.round((10 + Math.random() * 6) * 10) / 10;
        resultItemRows.push(
          { resultId, name: "Hemoglobina", value: String(haemoglobin), valueNumeric: haemoglobin, unit: "g/dL", referenceRange: "12,0–16,0", isAbnormal: haemoglobin < 12, flag: haemoglobin < 12 ? "BAIXO" : null },
          { resultId, name: "Leucócitos", value: String(int(4000, 12000)), unit: "/µL", referenceRange: "4.000–11.000", isAbnormal: false },
        );
      }
    }
  }

  for (const c of chunk(encounterRows, 1000)) await prisma.encounter.createMany({ data: c });
  for (const c of chunk(vitalRows, 1000)) await prisma.vitalSign.createMany({ data: c });
  for (const c of chunk(diagnosisRows, 1000)) await prisma.diagnosis.createMany({ data: c });
  for (const c of chunk(prescriptionRows, 1000)) await prisma.prescription.createMany({ data: c });
  for (const c of chunk(prescriptionItemRows, 1000)) await prisma.prescriptionItem.createMany({ data: c });
  for (const c of chunk(orderRows, 1000)) await prisma.diagnosticOrder.createMany({ data: c });
  for (const c of chunk(resultRows, 1000)) await prisma.diagnosticResult.createMany({ data: c });
  for (const c of chunk(resultItemRows, 1000)) await prisma.diagnosticResultItem.createMany({ data: c });

  // Liga cada consulta ao seu episódio.
  for (const encounter of encounterRows) {
    await prisma.consultation.updateMany({
      where: { clinicId, patientId: encounter.patientId, startedAt: encounter.startedAt as Date },
      data: { encounterId: encounter.id as string },
    });
  }

  console.log(
    `  ${encounterRows.length} episódios, ${allergyRows.length} alergias, ${prescriptionRows.length} receitas, ${orderRows.length} pedidos de exame`,
  );

  // ── Notifications ─────────────────────────────────────────────────────────
  console.log("› Notificações e auditoria…");
  await prisma.notification.createMany({
    data: [
      { clinicId, type: "STOCK_BAIXO", severity: "CRITICO", title: "Luvas de nitrilo tam. M abaixo do mínimo", body: "Stock atual 4 caixas · mínimo 10." },
      { clinicId, type: "STOCK_EXPIRA", severity: "AVISO", title: "Reagente hemograma expira em 21 dias", body: "Verifique o consumo antes do fim do prazo." },
      { clinicId, type: "CONTA_RECEBER", severity: "AVISO", title: "MEDIPLUS representa 37% das contas a receber", body: "Valor pendente acima do prazo médio." },
      { clinicId, type: "CAPACIDADE_MEDICO", severity: "INFO", title: "Dr. Carlos Nhaca com 46% de capacidade livre amanhã", body: "Há espaço para novas marcações." },
      { clinicId, type: "MARCACAO", severity: "INFO", title: "Próxima consulta às 08:00", body: "Sala 2 · Dra. Marta Sitoe." },
    ],
  });
  await prisma.auditLog.create({
    data: { clinicId, userId: admin.id, action: "seed.run", entity: "Clinic", entityId: clinicId, metadata: { appointments: apptRows.length } },
  });

  console.log("✔ Seed concluído.");
  console.log("  Login: admin@clinicamarianu.mz / pulso123");
  console.log(`  Portal do paciente: ${patients[0].id} / ${demoPortalToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
