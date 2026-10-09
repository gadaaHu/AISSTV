import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { fetchEmployees } from "../../api/endpoints";
import { ApiError } from "../../api/errors";
import { queryKeys } from "../../hooks/queries/keys";
import { useCreateLeave } from "../../hooks/queries/useLeaves";
import { LEAVE_TYPES } from "../../lib/constants";
import { inclusiveDayCount, todayIsoDay } from "../../lib/dates";
import { humanise } from "../../lib/format";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "../ui";

/**
 * The date fields are plain `YYYY-MM-DD` strings on both sides of the wire: an
 * `<input type="date">` already yields that format and the server accepts it
 * verbatim, so the value is never round-tripped through a `Date`. Doing that is
 * exactly how a request lands on the day before or after the one that was
 * picked, depending on the viewer's timezone.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const schema = z
  .object({
    employee_code: z
      .string()
      .trim()
      .min(1, "Choose the employee this request is for"),
    leave_type: z.enum(LEAVE_TYPES),
    start_date: z.string().regex(ISO_DAY, "Choose a start date"),
    end_date: z.string().regex(ISO_DAY, "Choose an end date"),
    reason: z.string().max(500, "Keep the reason under 500 characters"),
  })
  .refine((values) => values.end_date >= values.start_date, {
    path: ["end_date"],
    // Lexicographic comparison is exact for zero-padded ISO days and keeps the
    // check off the `Date` path. The server enforces the same rule with a 400.
    message: "The end date must be on or after the start date",
  });

type FormValues = z.infer<typeof schema>;

/** Shown when a 409 turns out not to be an overlap, i.e. a foreign-key failure. */
const MISSING_EMPLOYEE =
  "The server did not recognise that employee code, so the request was not " +
  "created. Reload the list and pick the employee again.";

/**
 * Files a leave request.
 *
 * Mounted only while open, so the form starts from its defaults every time and
 * `reset()` is never needed to clear a previous employee's half-typed request.
 */
export function LeaveRequestDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const createLeave = useCreateLeave();
  const [formError, setFormError] = useState<string | null>(null);

  // A picker, not a free-text code field: the server rejects an unknown
  // `employee_code` with a 409 from the foreign key, which is a useless thing
  // for a user to discover after typing.
  const employees = useQuery({
    queryKey: queryKeys.employees.list({
      q: "",
      active: true,
      limit: 200,
      offset: 0,
    }),
    queryFn: ({ signal }) =>
      fetchEmployees({ active: true, limit: 200, offset: 0 }, signal),
  });

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      employee_code: "",
      leave_type: "annual",
      start_date: todayIsoDay(),
      end_date: todayIsoDay(),
      reason: "",
    },
  });

  // Watched rather than read once from `getValues()`, so the end-date minimum
  // and the day count follow the picker as the user changes it.
  const startDate = useWatch({ control, name: "start_date" });
  const endDate = useWatch({ control, name: "end_date" });

  const dayCount = inclusiveDayCount(startDate, endDate);
  const employeeItems = employees.data?.items ?? [];
  const employeesFailed = employees.isError;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const reason = values.reason.trim();

    try {
      await createLeave.mutateAsync({
        employee_code: values.employee_code,
        leave_type: values.leave_type,
        start_date: values.start_date,
        end_date: values.end_date,
        // Optional on the wire, so a blank reason is omitted rather than sent
        // as `""`.
        ...(reason ? { reason } : {}),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The leave route answers 409 for two very different reasons and the
        // envelope does not separate them beyond the message text: an
        // overlapping pending/approved request for that employee, or a
        // foreign-key violation because the employee code does not exist.
        // Retrying is futile for both, so each gets its own message.
        const detail = error.detail ?? error.message;
        if (/overlap/i.test(detail)) {
          setError("start_date", {
            type: "server",
            message: "Overlaps an existing pending or approved request",
          });
          setFormError(
            "This employee already has a pending or approved request that " +
              "overlaps those dates. Change the dates, or cancel the other " +
              "request first.",
          );
        } else {
          setError("employee_code", { type: "server", message: MISSING_EMPLOYEE });
          setFormError(detail);
        }
        return;
      }

      setFormError(
        error instanceof ApiError
          ? error.message
          : "The leave request could not be created.",
      );
      return;
    }

    toast.success(
      "Leave request created",
      `${humanise(values.leave_type)} · ${dayCount} ${
        dayCount === 1 ? "day" : "days"
      }`,
    );
    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New leave request"
      description="Any signed-in user can file a request; an administrator or manager reviews it."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="leave-request-form"
            size="sm"
            loading={createLeave.isPending}
          >
            Submit request
          </Button>
        </>
      }
    >
      <form
        id="leave-request-form"
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
        className="flex flex-col gap-4"
      >
        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
          >
            {formError}
          </p>
        ) : null}

        <Field
          label="Employee"
          htmlFor="leave-request-employee"
          required
          error={errors.employee_code?.message}
          hint={
            employeesFailed
              ? "The employee list could not be loaded, so no code can be picked."
              : "The code must already exist on the server."
          }
        >
          <Select
            id="leave-request-employee"
            disabled={employeesFailed}
            invalid={Boolean(errors.employee_code)}
            aria-describedby={
              errors.employee_code
                ? "leave-request-employee-error"
                : "leave-request-employee-hint"
            }
            {...register("employee_code")}
          >
            <option value="">
              {employees.isPending ? "Loading employees…" : "Select an employee"}
            </option>
            {employeeItems.map((employee) => (
              <option key={employee.id} value={employee.code}>
                {employee.code} — {employee.name}
              </option>
            ))}
          </Select>
        </Field>

        {employeesFailed ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {employees.error instanceof ApiError
              ? employees.error.message
              : "The employee list could not be loaded."}{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => {
                void employees.refetch();
              }}
            >
              Try again
            </button>
          </p>
        ) : null}

        {employees.isSuccess && employeeItems.length === 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            There are no active employees to pick from. Add or reactivate an
            employee first.
          </p>
        ) : null}

        <Field
          label="Leave type"
          htmlFor="leave-request-type"
          required
          error={errors.leave_type?.message}
        >
          <Select
            id="leave-request-type"
            invalid={Boolean(errors.leave_type)}
            aria-describedby={
              errors.leave_type ? "leave-request-type-error" : undefined
            }
            {...register("leave_type")}
          >
            {LEAVE_TYPES.map((type) => (
              <option key={type} value={type}>
                {humanise(type)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Start date"
            htmlFor="leave-request-start"
            required
            error={errors.start_date?.message}
          >
            <Input
              id="leave-request-start"
              type="date"
              invalid={Boolean(errors.start_date)}
              aria-describedby={
                errors.start_date ? "leave-request-start-error" : undefined
              }
              {...register("start_date")}
            />
          </Field>

          <Field
            label="End date"
            htmlFor="leave-request-end"
            required
            error={errors.end_date?.message}
            // `min` is derived from the start date so the picker itself refuses
            // an inverted range; the schema refinement is the real gate and the
            // server answers 400 for the same rule.
            hint={startDate ? `On or after ${startDate}.` : "Inclusive of the start date."}
          >
            <Input
              id="leave-request-end"
              type="date"
              min={startDate ? startDate : undefined}
              invalid={Boolean(errors.end_date)}
              aria-describedby={
                errors.end_date
                  ? "leave-request-end-error"
                  : "leave-request-end-hint"
              }
              {...register("end_date")}
            />
          </Field>
        </div>

        <p aria-live="polite" className="text-xs text-slate-500 dark:text-slate-400">
          {dayCount > 0
            ? `That is ${dayCount} ${dayCount === 1 ? "day" : "days"} of leave.`
            : "Pick a start and an end date to see the day count."}
        </p>

        <Field
          label="Reason"
          htmlFor="leave-request-reason"
          error={errors.reason?.message}
          hint="Optional, up to 500 characters."
        >
          <Textarea
            id="leave-request-reason"
            rows={3}
            maxLength={500}
            invalid={Boolean(errors.reason)}
            aria-describedby={
              errors.reason
                ? "leave-request-reason-error"
                : "leave-request-reason-hint"
            }
            {...register("reason")}
          />
        </Field>
      </form>
    </Modal>
  );
}
