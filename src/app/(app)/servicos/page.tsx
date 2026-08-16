import { FlaskConical } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { TableRecordCrudCell } from "@/components/table-record-crud-cell";
import { createServiceRecord, deleteServiceRecord, updateServiceRecord } from "@/server/crud-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMZN } from "@/lib/money";

const SOURCE_LABEL: Record<string, string> = {
  CONSULTA: "Consulta",
  EXAME: "Exame",
  PROCEDIMENTO: "Procedimento",
  PRODUTO: "Produto",
  SEGURADORA: "Seguradora",
  PRIVADO: "Privado",
  OUTRO: "Outro",
};

export default async function ServicosPage() {
  const user = await requirePermission("service.view");
  const services = await prisma.service.findMany({
    where: { clinicId: user.clinicId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { appointments: true } } },
  });
  const canManage = can(user.role, "service.manage");

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Serviços e Exames"
        description={`${services.length} serviços · tabela de preços da clínica`}
        actions={
          canManage ? (
            <CadastroButton
              label="Novo serviço"
              title="Novo serviço ou exame"
              description="Fica disponível para marcação e define o preço cobrado."
              action={createServiceRecord}
              fields={[
                { name: "name", label: "Nome", required: true, full: true, placeholder: "Ex.: Hemograma completo" },
                { name: "source", label: "Tipo", type: "select", defaultValue: "EXAME", options: [
                  { value: "EXAME", label: "Exame" },
                  { value: "PROCEDIMENTO", label: "Procedimento" },
                  { value: "CONSULTA", label: "Consulta" },
                  { value: "PRODUTO", label: "Produto" },
                  { value: "OUTRO", label: "Outro" },
                ] },
                { name: "category", label: "Categoria", defaultValue: "Análises clínicas", placeholder: "Ex.: Imagiologia" },
                { name: "basePrice", label: "Preço", type: "money", required: true, suffix: "MZN", placeholder: "1200", full: true },
              ]}
            />
          ) : undefined
        }
      />

      <Card>
        <CardContent className="p-0">
          {services.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FlaskConical}
                title="Sem serviços cadastrados"
                description="Cadastre os exames e procedimentos da clínica para os poder marcar e facturar."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Marcações</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead>Estado</TableHead>
                  {canManage && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{s.category}</TableCell>
                    <TableCell><Badge variant="neutral">{SOURCE_LABEL[s.source] ?? s.source}</Badge></TableCell>
                    <TableCell className="text-right tabular">{s._count.appointments}</TableCell>
                    <TableCell className="text-right font-medium tabular">{formatMZN(s.basePrice)}</TableCell>
                    <TableCell><Badge variant={s.isActive ? "success" : "neutral"}>{s.isActive ? "Activo" : "Inactivo"}</Badge></TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <TableRecordCrudCell
                          id={s.id}
                          title="Editar serviço"
                          description="Atualize os detalhes do serviço ou exame."
                          fields={[
                            { name: "name", label: "Nome", required: true, defaultValue: s.name },
                            { name: "category", label: "Categoria", defaultValue: s.category },
                            { name: "source", label: "Tipo", type: "select", defaultValue: s.source, options: [
                              { value: "EXAME", label: "Exame" },
                              { value: "PROCEDIMENTO", label: "Procedimento" },
                              { value: "CONSULTA", label: "Consulta" },
                              { value: "PRODUTO", label: "Produto" },
                              { value: "OUTRO", label: "Outro" },
                            ] },
                            { name: "basePrice", label: "Preço", type: "money", required: true, defaultValue: String(s.basePrice), suffix: "MZN" },
                          ]}
                          updateAction={updateServiceRecord}
                          deleteAction={deleteServiceRecord}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
