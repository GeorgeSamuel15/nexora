import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { request, rows, label, errorMessage, type Row } from "./api";
import type { Field } from "./catalog";
function Lookup({
  field,
  value,
  onChange,
  pipelineId,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
  pipelineId: string;
}) {
  const source = field.source === "@stages" ? "/pipelines" : (field.source ?? "");
  const query = useQuery({
    queryKey: ["lookup", source],
    queryFn: () => request(`${source}?pageSize=100`),
  });
  const items =
    field.source === "@stages"
      ? rows(rows(query.data).find((p) => p.id === pipelineId)?.stages)
      : rows(query.data);
  return (
    <>
      <select
        required={!field.optional}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={query.isPending}
      >
        <option value="">
          {query.isPending ? "Loading…" : `Select ${label(field.key.replace(/Id$/, ""))}`}
        </option>
        {items.map((item) => (
          <option key={String(item.id)} value={String(item[field.valueKey ?? "id"])}>
            {String(
              item.name ??
                item.title ??
                item.invoiceNumber ??
                item.email ??
                ([item.firstName, item.lastName].filter(Boolean).join(" ") ||
                  item.userId ||
                  item.id),
            )}
          </option>
        ))}
      </select>
      {query.isError && (
        <span role="alert" className="error">
          {errorMessage(query.error)}
        </span>
      )}
    </>
  );
}
export function RecordForm({
  fields,
  initial = {},
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: {
  fields: Field[];
  initial?: Row;
  onSubmit: (data: Row) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const defaults: Row = {
    currency: "USD",
    items: [{ description: "", quantity: 1, unitPrice: 0 }],
    ...initial,
  };
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<Row>({ defaultValues: defaults });
  const [items, setItems] = useState([{ description: "", quantity: 1, unitPrice: 0 }]);
  const lineItems = {
    fields: items.map((item, index) => ({ ...item, id: String(index) })),
    remove: (index: number) => setItems(items.filter((_, i) => i !== index)),
    append: (item: { description: string; quantity: number; unitPrice: number }) =>
      setItems([...items, item]),
  };
  const [error, setError] = useState("");
  return (
    <form
      className="record-form"
      onSubmit={handleSubmit(async (values) => {
        setError("");
        try {
          const data: Row = {};
          for (const field of fields) {
            const value = field.type === "items" ? items : values[field.key];
            if ((value === "" || value === undefined) && field.optional) continue;
            if (field.type === "number") data[field.key] = z.coerce.number().finite().parse(value);
            else if (field.type === "email") data[field.key] = z.string().email().parse(value);
            else if (field.type === "items")
              data[field.key] = z
                .array(
                  z.object({
                    description: z.string().min(1),
                    quantity: z.coerce.number().positive(),
                    unitPrice: z.coerce.number().nonnegative(),
                  }),
                )
                .min(1)
                .parse(value);
            else
              data[field.key] = z
                .string()
                .min(1, `${label(field.key)} is required`)
                .parse(value);
          }
          await onSubmit(data);
        } catch (e) {
          setError(errorMessage(e));
        }
      })}
    >
      {fields.map((field) => (
        <label
          key={field.key}
          className={field.type === "items" || field.type === "textarea" ? "wide" : ""}
        >
          <span>
            {label(field.key)}
            {field.optional ? <small> Optional</small> : null}
          </span>
          {field.type === "items" ? (
            <div className="line-items">
              {lineItems.fields.map((item, index) => (
                <div key={item.id} className="line-item">
                  <input
                    aria-label={`Item ${index + 1} description`}
                    placeholder="Description"
                    required
                    value={item.description}
                    onChange={(e) =>
                      setItems(
                        items.map((v, i) =>
                          i === index ? { ...v, description: e.target.value } : v,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Item ${index + 1} quantity`}
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) =>
                      setItems(
                        items.map((v, i) =>
                          i === index ? { ...v, quantity: Number(e.target.value) } : v,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Item ${index + 1} unit price`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) =>
                      setItems(
                        items.map((v, i) =>
                          i === index ? { ...v, unitPrice: Number(e.target.value) } : v,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="subtle"
                    disabled={lineItems.fields.length === 1}
                    onClick={() => lineItems.remove(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="subtle"
                onClick={() => lineItems.append({ description: "", quantity: 1, unitPrice: 0 })}
              >
                Add line item
              </button>
            </div>
          ) : field.source ? (
            <Lookup
              field={field}
              value={String(watch(field.key) ?? "")}
              onChange={(v) => setValue(field.key, v)}
              pipelineId={String(watch("pipelineId") ?? "")}
            />
          ) : field.type === "select" ? (
            <select required={!field.optional} {...register(field.key)}>
              <option value="">Choose…</option>
              {field.options?.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ) : field.type === "textarea" ? (
            <textarea rows={3} required={!field.optional} {...register(field.key)} />
          ) : (
            <input
              type={field.type ?? "text"}
              step={field.type === "number" ? "any" : undefined}
              required={!field.optional}
              autoComplete={field.type === "password" ? "new-password" : undefined}
              {...register(field.key)}
            />
          )}
        </label>
      ))}
      {error && (
        <div className="error wide" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions wide">
        {onCancel && (
          <button type="button" className="subtle" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button disabled={isSubmitting}>{isSubmitting ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
