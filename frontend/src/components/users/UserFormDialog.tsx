import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type { UserInput, UserOut, UserUpdate } from "../../api/types";
import { Button, Field, Input, Modal, Select, Switch } from "../ui";
import { useCreateUser, useUpdateUser } from "../../hooks/queries/useUsers";
import { errorMessage } from "../../lib/utils";

const formSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z.string(),
  full_name: z.string(),
  role: z.enum(["admin", "manager", "viewer", "guard", "authorizor"]),
  active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const BLANK_FORM: FormValues = {
  username: "",
  password: "",
  full_name: "",
  role: "viewer",
  active: true,
};

function valuesFor(user: UserOut | null): FormValues {
  if (!user) return BLANK_FORM;
  return {
    username: user.username,
    password: "", // Never populated on edit
    full_name: user.full_name ?? "",
    role: user.role as FormValues["role"],
    active: user.active,
  };
}

function orUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserOut | null;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const isEdit = user !== null;

  const create = useCreateUser();
  const update = useUpdateUser();
  const saving = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(
      // On edit, password can be empty. On create, it's required.
      formSchema.superRefine((val, ctx) => {
        if (!isEdit && !val.password.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["password"],
            message: "Password is required.",
          });
        }
      })
    ),
    defaultValues: valuesFor(user),
  });

  const activeValue = useWatch({ control, name: "active" });

  useEffect(() => {
    if (open) {
      reset(valuesFor(user));
      create.reset();
      update.reset();
    }
  }, [open, user, reset, create, update]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit) {
      const payload: UserUpdate = {
        full_name: orUndefined(values.full_name),
        role: values.role,
        active: values.active,
      };
      // Note: Backend might not support password update here, it's usually separate or through a different field.
      // Assuming UserUpdate only has full_name, role, active for now as per api/types.ts
      
      update.mutate(
        { username: user.username, body: payload },
        {
          onSuccess: () => onOpenChange(false),
        }
      );
    } else {
      const payload: UserInput = {
        username: values.username.trim(),
        password: values.password,
        full_name: orUndefined(values.full_name),
        role: values.role,
        active: values.active,
      };

      create.mutate(payload, {
        onSuccess: () => onOpenChange(false),
      });
    }
  });

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={isEdit ? "Edit User" : "Add User"}
      description={
        isEdit
          ? "Update details for this user. The username cannot be changed."
          : "Create a new user to access the console."
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {errorMessage(error)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Username" error={errors.username?.message}>
            <Input
              {...register("username")}
              disabled={isEdit}
              placeholder="jdoe"
              autoComplete="off"
            />
          </Field>

          <Field label="Role" error={errors.role?.message}>
            <Select
              {...register("role")}
              disabled={saving}
            >
              <option value="admin">Admin</option>
              <option value="authorizor">Authorizor</option>
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
              <option value="guard">Guard</option>
            </Select>
          </Field>
        </div>

        <Field label="Full name (optional)" error={errors.full_name?.message}>
          <Input
            {...register("full_name")}
            disabled={saving}
            placeholder="John Doe"
          />
        </Field>

        {!isEdit && (
          <Field label="Password" error={errors.password?.message}>
            <Input
              type="password"
              {...register("password")}
              disabled={saving}
              placeholder="Min 8 characters"
            />
          </Field>
        )}

        {isEdit && (
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Account status
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {activeValue ? "Active and can sign in" : "Deactivated"}
                </p>
              </div>
              <Switch
                checked={activeValue}
                onChange={(checked: boolean) => setValue("active", checked, { shouldDirty: true })}
                disabled={saving || user?.username === "admin"}
                label=""
              />
            </div>
          </div>
        )}
      </form>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="user-form" loading={saving}>
          {isEdit ? "Save changes" : "Create user"}
        </Button>
      </div>
    </Modal>
  );
}
