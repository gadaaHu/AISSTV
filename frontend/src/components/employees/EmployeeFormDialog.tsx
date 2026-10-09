import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type { Employee, EmployeeInput, EmployeeUpdate } from "../../api/types";
import { Button, Field, Input, Modal, Switch } from "../ui";
import {
  useCreateEmployee,
  useUpdateEmployee,
} from "../../hooks/queries/useEmployees";
import { formatText } from "../../lib/format";
import { errorMessage } from "../../lib/utils";

/**
 * Create/edit form for an employee.
 *
 * Two wire formats matter here and neither is a `Date`:
 *
 * * `shift_start` / `shift_end` are wall-clock strings (`"09:00:00"`). They are
 *   edited with `<input type="time">`, which speaks `"HH:MM"`, and normalised
 *   back to `"HH:MM:00"` on the way out. Parsing one into a `Date` would move
 *   the shift into the viewer's timezone, which is exactly the bug avoided here.
 * * `code` is the natural key and is immutable, so on edit it is shown
 *   read-only and never sent.
 *
 * Validation is client-side because a server 422 carries no field-level detail:
 * its message can never point at a specific input.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Only the shapes the brief names are enforced. No length rule is invented for
 * `code`, because the server documents its own constraint and a guess here
 * would reject values the backend accepts.
 */
const formSchema = z
  .object({
    code: z.string(),
    name: z.string().trim().min(1, "Name is required."),
    email: z.string(),
    department: z.string(),
    title: z.string(),
    shift_start: z.string(),
    shift_end: z.string(),
    timezone: z.string(),
    active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.email.trim() && !EMAIL_SHAPE.test(values.email.trim())) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Enter an email address, or leave this blank.",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

/** `"09:00:00"` → `"09:00"`, the only shape `<input type="time">` accepts. */
function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const [hours, minutes] = value.trim().split(":");
  if (!hours || !minutes) return "";
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

/** `"09:00"` → `"09:00:00"`. Anything unparseable is dropped, never guessed at. */
function toWireTime(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const [hours, minutes] = trimmed.split(":");
  if (!hours || !minutes) return undefined;
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:00`;
}

function orUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const BLANK_FORM: FormValues = {
  code: "",
  name: "",
  email: "",
  department: "",
  title: "",
  shift_start: "",
  shift_end: "",
  timezone: "",
  active: true,
};

function valuesFor(employee: Employee | null): FormValues {
  if (!employee) return BLANK_FORM;
  return {
    code: employee.code,
    name: employee.name,
    email: employee.email ?? "",
    department: employee.department ?? "",
    title: employee.title ?? "",
    shift_start: toTimeInputValue(employee.shift_start),
    shift_end: toTimeInputValue(employee.shift_end),
    timezone: employee.timezone,
    active: employee.active,
  };
}

function buildCreateInput(values: FormValues): EmployeeInput {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    email: orUndefined(values.email),
    department: orUndefined(values.department),
    title: orUndefined(values.title),
    shift_start: toWireTime(values.shift_start),
    shift_end: toWireTime(values.shift_end),
    timezone: orUndefined(values.timezone),
  };
}

/**
 * `PATCH /employees/{code}` applies `exclude_none`, so a field is only worth
 * sending when it actually changed: a blank one cannot clear what is stored, so
 * it is left out rather than sent as an empty string the server would ignore.
 *
 * The comparisons are written out one field at a time on purpose — a loop over
 * a field-name union cannot be typed safely against `EmployeeUpdate`.
 */
function buildUpdate(employee: Employee, values: FormValues): EmployeeUpdate {
  const body: EmployeeUpdate = {};

  const name = values.name.trim();
  if (name !== employee.name) body.name = name;

  const email = values.email.trim();
  // A blank or unchanged value is simply omitted: sending "" would not clear
  // anything, it would only look like it should.
  if (email && email !== (employee.email ?? "")) body.email = email;

  const department = values.department.trim();
  if (department && department !== (employee.department ?? "")) {
    body.department = department;
  }

  const title = values.title.trim();
  if (title && title !== (employee.title ?? "")) body.title = title;

  const timezone = values.timezone.trim();
  if (timezone && timezone !== employee.timezone) body.timezone = timezone;

  const shiftStart = toWireTime(values.shift_start);
  if (shiftStart && shiftStart !== employee.shift_start) {
    body.shift_start = shiftStart;
  }

  const shiftEnd = toWireTime(values.shift_end);
  if (shiftEnd && shiftEnd !== employee.shift_end) {
    body.shift_end = shiftEnd;
  }

  if (values.active !== employee.active) body.active = values.active;

  return body;
}

export function EmployeeFormDialog({
  open,
  employee,
  onClose,
}: {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
}) {
  const isEdit = employee !== null;

  const createMutation = useCreateEmployee(onClose);
  const updateMutation = useUpdateEmployee(onClose);
  const submitting = createMutation.isPending || updateMutation.isPending;
  const serverError = createMutation.error ?? updateMutation.error;

  /**
   * Built rather than declared once, because `code` is required on create only:
   * on edit it is the immutable key and is never sent.
   */
  const schema = useMemo(() => {
    if (isEdit) return formSchema;
    return formSchema.superRefine((values, ctx) => {
      if (!values.code.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["code"],
          message: "Code is required.",
        });
      }
    });
  }, [isEdit]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: BLANK_FORM,
  });

  // Re-seed on every open, so a cancelled edit never leaves its values behind
  // for the next dialog.
  useEffect(() => {
    if (open) reset(valuesFor(employee));
  }, [open, employee, reset]);

  // `useWatch` rather than `watch()`: the latter returns a function from an
  // API the React Compiler cannot memoize, which makes it skip this component.
  const active = useWatch({ control, name: "active" }) ?? BLANK_FORM.active;

  const onSubmit = handleSubmit(async (values) => {
    if (employee) {
      const body = buildUpdate(employee, values);
      // Nothing changed, so there is no request to make and no toast to show.
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      // A rejection is surfaced by the mutation's own `onError` toast; letting
      // it propagate keeps this dialog open with the user's input intact.
      await updateMutation.mutateAsync({ code: employee.code, body });
      return;
    }

    await createMutation.mutateAsync(buildCreateInput(values));
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit ${employee.name}` : "Add employee"}
      description={
        isEdit
          ? `Code ${employee.code} is the key the cameras report against, so it cannot be changed.`
          : "A server 422 answers with a generic message and no field detail, so this form validates the values itself."
      }
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={submitting}
            onClick={() => {
              void onSubmit();
            }}
          >
            {isEdit ? "Save changes" : "Create employee"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Employee code"
            htmlFor="employee-code"
            required={!isEdit}
            error={errors.code?.message}
            hint={
              isEdit
                ? "Immutable: camera events and past attendance rows key off this value."
                : "The identifier the cameras send, for example EMP001."
            }
          >
            <Input
              id="employee-code"
              autoComplete="off"
              readOnly={isEdit}
              invalid={Boolean(errors.code)}
              aria-describedby={
                errors.code ? "employee-code-error" : "employee-code-hint"
              }
              className="font-mono"
              {...register("code")}
            />
          </Field>

          <Field
            label="Full name"
            htmlFor="employee-name"
            required
            error={errors.name?.message}
          >
            <Input
              id="employee-name"
              autoComplete="name"
              invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "employee-name-error" : undefined}
              {...register("name")}
            />
          </Field>

          <Field
            label="Email"
            htmlFor="employee-email"
            error={errors.email?.message}
            hint="Optional. Leave it blank rather than typing a placeholder."
          >
            <Input
              id="employee-email"
              type="email"
              autoComplete="email"
              invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? "employee-email-error" : "employee-email-hint"
              }
              {...register("email")}
            />
          </Field>

          <Field label="Department" htmlFor="employee-department">
            <Input
              id="employee-department"
              autoComplete="off"
              {...register("department")}
            />
          </Field>

          <Field label="Job title" htmlFor="employee-title">
            <Input
              id="employee-title"
              autoComplete="off"
              {...register("title")}
            />
          </Field>

          <Field
            label="Timezone"
            htmlFor="employee-timezone"
            hint="IANA name, for example Africa/Addis_Ababa."
          >
            <Input
              id="employee-timezone"
              autoComplete="off"
              aria-describedby="employee-timezone-hint"
              {...register("timezone")}
            />
          </Field>

          <Field
            label="Shift start"
            htmlFor="employee-shift-start"
            hint="Local wall-clock time, not an instant."
          >
            <Input
              id="employee-shift-start"
              type="time"
              aria-describedby="employee-shift-start-hint"
              {...register("shift_start")}
            />
          </Field>

          <Field
            label="Shift end"
            htmlFor="employee-shift-end"
            hint="Local wall-clock time, not an instant."
          >
            <Input
              id="employee-shift-end"
              type="time"
              aria-describedby="employee-shift-end-hint"
              {...register("shift_end")}
            />
          </Field>
        </div>

        {isEdit ? (
          <Switch
            id="employee-active"
            checked={active}
            onChange={(next) => setValue("active", next, { shouldDirty: true })}
            label="Active"
            description="An inactive employee keeps their history but is no longer scored for attendance."
          />
        ) : null}

        {isEdit ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <span className="font-semibold">A real limitation: </span>
            saving sends a <code className="font-mono">PATCH</code> that drops
            empty fields, so clearing a box here cannot erase the stored value —
            the previous value comes back after the refresh. To stop an employee
            being counted, switch <em>Active</em> off instead.
          </p>
        ) : null}

        {serverError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          >
            {errorMessage(serverError, "The request failed.")}
          </p>
        ) : null}

        {isEdit ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Stored now: {formatText(employee.email)} ·{" "}
            {formatText(employee.department)} · {formatText(employee.title)}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
