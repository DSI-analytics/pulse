import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { getTranslator } from "@/i18n/server";

export interface ListFilterField {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  type?: "search" | "select" | "date";
  options?: { value: string; label: string }[];
}

/** Barra de filtros: é controlo, não conteúdo — por isso vive em vidro. */
export async function ListFilters({
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
  const t = await getTranslator();
  const active = fields.some((field) => field.value);

  return (
    <div className="glass-thin min-w-0 max-w-full rounded-[22px] p-2">
      <form action={action} className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        {Object.entries(hidden ?? {}).map(([name, value]) => value && <input key={name} type="hidden" name={name} value={value} />)}
        <SlidersHorizontal className="ml-2 hidden size-4 shrink-0 text-subtle-foreground md:block" aria-hidden />
        {fields.map((field) => {
          const type = field.type ?? "select";
          if (type === "select") {
            return (
              <Select key={field.name} name={field.name} defaultValue={field.value ?? ""} aria-label={field.label} className="w-full min-w-0 max-w-full bg-surface md:w-auto md:min-w-36 md:flex-1 xl:flex-none">
                <option value="">{t("common.allOption", { label: field.label })}</option>
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
              {type === "search" && <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />}
              <Input
                type={type === "date" ? "date" : "search"}
                name={field.name}
                defaultValue={field.value ?? ""}
                placeholder={field.placeholder ?? field.label}
                aria-label={field.label}
                className={type === "search" ? "bg-surface pl-10" : "bg-surface"}
              />
            </div>
          );
        })}
        <Button type="submit"><Search /> {t("common.filter")}</Button>
        {active && <Link href={clearHref} className={buttonVariants({ variant: "ghost" })}><X /> {t("common.clear")}</Link>}
      </form>
    </div>
  );
}
