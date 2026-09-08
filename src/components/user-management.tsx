"use client";

import * as React from "react";
import { KeyRound, Loader2, Pencil, Plus, Power, PowerOff, Search, UserRoundCog } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { createUser, resetUserPassword, setUserActive, updateUser } from "@/server/user-actions";
import { ROLE_LABELS } from "@/lib/rbac";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  doctor: { id: string; name: string } | null;
}

interface DoctorOption { id: string; name: string; userId: string | null }
interface FormValues { name: string; email: string; role: UserRole; doctorId: string }

const EMPTY: FormValues = { name: "", email: "", role: "RECEPTIONIST", doctorId: "" };

export function UserManagement({ users, doctors, currentUserId, currentRole }: {
  users: ManagedUser[];
  doctors: DoctorOption[];
  currentUserId: string;
  currentRole: UserRole;
}) {
  const toast = useToast();
  const [editing, setEditing] = React.useState<ManagedUser | "new" | null>(null);
  const [values, setValues] = React.useState<FormValues>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  const roles = (Object.keys(ROLE_LABELS) as UserRole[]).filter((role) => currentRole === "SUPER_ADMIN" || role !== "SUPER_ADMIN");
  const filteredUsers = users.filter((user) => {
    const term = query.trim().toLocaleLowerCase("pt");
    return (!term || user.name.toLocaleLowerCase("pt").includes(term) || user.email.toLocaleLowerCase("pt").includes(term))
      && (!roleFilter || user.role === roleFilter)
      && (!statusFilter || (statusFilter === "ativo" ? user.isActive : !user.isActive));
  });

  function openNew() {
    setValues(EMPTY);
    setError(null);
    setPassword(null);
    setEditing("new");
  }

  function openEdit(user: ManagedUser) {
    setValues({ name: user.name, email: user.email, role: user.role, doctorId: user.doctor?.id ?? "" });
    setError(null);
    setPassword(null);
    setEditing(user);
  }

  function close() {
    if (saving) return;
    setEditing(null);
    setPassword(null);
  }

  async function submit() {
    setError(null);
    setSaving(true);
    const result = editing === "new" ? await createUser(values) : await updateUser(editing!.id, values);
    setSaving(false);
    if ("error" in result) return setError(result.error);
    if (result.password) {
      setPassword(result.password);
      toast("Utilizador criado com sucesso");
      return;
    }
    toast("Utilizador atualizado com sucesso");
    setEditing(null);
  }

  async function toggle(user: ManagedUser) {
    setBusyId(user.id);
    const result = await setUserActive(user.id, !user.isActive);
    setBusyId(null);
    if ("error" in result) return toast(result.error, "error");
    toast(user.isActive ? "Utilizador desativado" : "Utilizador ativado");
  }

  async function reset(user: ManagedUser) {
    if (!window.confirm(`Redefinir a palavra-passe de ${user.name}?`)) return;
    setBusyId(user.id);
    const result = await resetUserPassword(user.id);
    setBusyId(null);
    if ("error" in result) return toast(result.error, "error");
    setPassword(result.password ?? null);
    setEditing(user);
    toast("Palavra-passe redefinida");
  }

  const isProtectedSuperAdmin = currentRole !== "SUPER_ADMIN" && editing !== "new" && editing?.role === "SUPER_ADMIN";
  const availableDoctors = doctors.filter((doctor) => !doctor.userId || (editing !== "new" && editing?.id === doctor.userId));

  return (
    <>
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium">Controlo de acessos</p>
          <p className="text-[13px] text-muted-foreground">Crie contas, atribua perfis e associe médicos sem alterar a base de dados.</p>
        </div>
        <Button onClick={openNew}><Plus /> Novo utilizador</Button>
      </div>

      <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-surface-2/40 p-3 md:flex-row">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou email…" aria-label="Pesquisar utilizadores" className="pl-9" />
        </div>
        <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filtrar por perfil" className="min-w-40">
          <option value="">Perfil: Todos</option>
          {roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por estado" className="min-w-36">
          <option value="">Estado: Todos</option><option value="ativo">Activo</option><option value="inativo">Inactivo</option>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Utilizador</TableHead><TableHead>Perfil</TableHead><TableHead>Médico</TableHead>
            <TableHead>Estado</TableHead><TableHead>Último acesso</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredUsers.map((user) => {
            const protectedUser = currentRole !== "SUPER_ADMIN" && user.role === "SUPER_ADMIN";
            const busy = busyId === user.id;
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <p className="font-medium">{user.name}{user.id === currentUserId && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}</p>
                  <p className="font-mono text-[12px] text-muted-foreground">{user.email}</p>
                </TableCell>
                <TableCell><Badge>{ROLE_LABELS[user.role]}</Badge></TableCell>
                <TableCell className="text-[13px] text-muted-foreground">{user.doctor?.name ?? "—"}</TableCell>
                <TableCell><Badge variant={user.isActive ? "success" : "neutral"}>{user.isActive ? "Activo" : "Inactivo"}</Badge></TableCell>
                <TableCell className="whitespace-nowrap text-[13px] text-muted-foreground">
                  {user.lastLoginAt ? new Intl.DateTimeFormat("pt-MZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(user.lastLoginAt)) : "Nunca"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Editar" aria-label={`Editar ${user.name}`} disabled={protectedUser || busy} onClick={() => openEdit(user)}><Pencil /></Button>
                    <Button variant="ghost" size="icon" title="Redefinir palavra-passe" aria-label={`Redefinir palavra-passe de ${user.name}`} disabled={protectedUser || busy} onClick={() => reset(user)}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />}</Button>
                    <Button variant="ghost" size="icon" title={user.isActive ? "Desativar" : "Ativar"} aria-label={`${user.isActive ? "Desativar" : "Ativar"} ${user.name}`} disabled={protectedUser || busy || (user.id === currentUserId && user.isActive)} onClick={() => toggle(user)}>
                      {user.isActive ? <PowerOff className="text-danger" /> : <Power className="text-success" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {filteredUsers.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhum utilizador corresponde aos filtros.</TableCell></TableRow>}
        </TableBody>
      </Table>

      {editing && (
        <Modal
          open
          onClose={close}
          title={editing === "new" ? "Criar utilizador" : `Editar ${editing.name}`}
          description={editing === "new" ? "A conta será criada com a palavra-passe padrão da clínica." : "Atualize os dados de acesso e a associação clínica."}
          footer={password ? <Button onClick={() => { setEditing(null); setPassword(null); }}>Concluir</Button> : <><Button variant="ghost" onClick={close}>Cancelar</Button><Button onClick={submit} disabled={saving || isProtectedSuperAdmin}>{saving ? <Loader2 className="animate-spin" /> : <UserRoundCog />} Guardar</Button></>}
        >
          {password ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Partilhe esta palavra-passe com o utilizador por um canal seguro:</p>
              <div className="rounded-lg border border-border bg-surface-2 p-4 text-center font-mono text-lg font-semibold tracking-wide">{password}</div>
              <p className="text-xs text-muted-foreground">Este valor só é mostrado durante esta operação.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label htmlFor="user-name">Nome</Label><Input id="user-name" className="mt-1.5" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} autoComplete="off" /></div>
              <div className="sm:col-span-2"><Label htmlFor="user-email">Email</Label><Input id="user-email" className="mt-1.5" type="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} autoComplete="off" /></div>
              <div><Label htmlFor="user-role">Perfil</Label><Select id="user-role" className="mt-1.5" value={values.role} disabled={editing !== "new" && editing.id === currentUserId} onChange={(e) => setValues((v) => ({ ...v, role: e.target.value as UserRole }))}>{roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</Select></div>
              <div><Label htmlFor="user-doctor">Médico associado</Label><Select id="user-doctor" className="mt-1.5" value={values.doctorId} onChange={(e) => setValues((v) => ({ ...v, doctorId: e.target.value }))}><option value="">Nenhum</option>{availableDoctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</Select></div>
              {error && <p className="sm:col-span-2 rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
