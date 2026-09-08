import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";

export interface ListFilterField {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  type?: "search" | "select" | "date";
  options?: { value: string; label: string }[];
}

export function ListFilters({
  action,
  fields,
  hidden,
  clearHref = action,
}: {
  action: string;
  fields: ListFilterField[];
  hidden?: Record<string, string | undefined>;
  clearHref?: string;
}) {
  const active = fields.some((field) => field.value);

  return (
    <Card className="min-w-0 max-w-full p-3">
      <form action={action} className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        {Object.entries(hidden ?? {}).map(([name, value]) => value && <input key={name} type="hidden" name={name} value={value} />)}
        <SlidersHorizontal className="hidden size-4 shrink-0 text-muted-foreground md:block" aria-hidden />
        {fields.map((field) => {
          const type = field.type ?? "select";
          if (type === "select") {
            return (
              <Select key={field.name} name={field.name} defaultValue={field.value ?? ""} aria-label={field.label} className="w-full min-w-0 max-w-full md:w-auto md:min-w-36 md:flex-1 xl:flex-none">
                <option value="">{field.label}: Todos</option>
                {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            );
          }
          return (
            <div
              key={field.name}
              className={type === "search"
                ? "relative w-full min-w-0 md:min-w-52 md:flex-1"
                : "w-full min-w-0 max-w-full md:w-auto md:min-w-40 md:flex-1 xl:flex-none"}
            >
              {type === "search" && <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />}
              <Input
                type={type === "date" ? "date" : "search"}
                name={field.name}
                defaultValue={field.value ?? ""}
                placeholder={field.placeholder ?? field.label}
                aria-label={field.label}
                className={type === "search" ? "pl-9" : ""}
              />
            </div>
          );
        })}
        <Button type="submit" variant="secondary"><Search /> Filtrar</Button>
        {active && <Link href={clearHref} className={buttonVariants({ variant: "ghost" })}><X /> Limpar</Link>}
      </form>
    </Card>
  );
}
