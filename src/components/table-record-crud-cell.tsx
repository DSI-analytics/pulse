"use client";

import { RecordCrudButton, type CrudField, type CrudActionResult } from "@/components/record-crud-button";

export function TableRecordCrudCell({
  id,
  title,
  description,
  fields,
  updateAction,
  deleteAction,
}: {
  id: string;
  title: string;
  description?: string;
  fields: CrudField[];
  updateAction: (id: string, values: Record<string, string>) => Promise<CrudActionResult>;
  deleteAction: (id: string) => Promise<CrudActionResult>;
}) {
  return (
    <RecordCrudButton
      id={id}
      title={title}
      description={description}
      fields={fields}
      updateAction={updateAction}
      deleteAction={deleteAction}
    />
  );
}
