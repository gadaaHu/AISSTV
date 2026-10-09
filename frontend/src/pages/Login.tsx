import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAuth } from "../auth/useAuth";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Icon,
  Input,
  ThemeToggle,
} from "../components/ui";

/**
 * The sign-in form.
 *
 * The backend answers a 401 with a generic "Invalid credentials" and no
 * field-level detail (see `src/api/errors.ts`), so both fields are validated
 * here and the failure is reported once, at the top of the card.
 */
const credentialsSchema = z.object({
  username: z.string().trim().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
});

type Credentials = z.infer<typeof credentialsSchema>;

/**
 * There is deliberately no `navigate()` call on success.
 *
 * `App.tsx` renders `<Navigate to="/" replace />` for `/login` the moment
 * `user` is set, so signing in already redirects. Calling `navigate()` here
 * duplicated that and, from an effect that ran during render, produced React's
 * "state update on a component that is not mounted" warning.
 */
export function Login() {
  const { error: authError, clearError, signIn } = useAuth();

  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { username: "", password: "" },
    mode: "onTouched",
  });

  const {
    formState: { errors, isSubmitting, isValid },
    handleSubmit,
    register,
    reset,
  } = form;

  // The seeded backend account exists only in development; offering a one-tap
  // fill for credentials that cannot work in production would be a trap.
  const isDev = import.meta.env.DEV;

  const mutation = useMutation({
    mutationFn: (values: Credentials) => signIn(values.username, values.password),
  });

  const onSubmit = handleSubmit((values) => mutation.mutateAsync(values));

  // Editing a field is the user's attempt at a fix, so the stale failure notice
  // goes away. RHF's `register` cannot also report the change, hence the
  // paired `onChange` below.
  const clearFailure = () => {
    if (authError) clearError();
  };

  const busy = mutation.isPending || isSubmitting;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-100 via-blue-50 to-purple-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <div className="flex w-full max-w-sm justify-end">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-sm shadow-xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="gemini-border gemini-float grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg">
            <Icon name="camera" className="h-7 w-7" />
          </span>
          <div>
            <h1 className="gemini-text text-xl font-bold tracking-tight">
              AISSTV Attendance
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Sign in to the admin console
            </p>
          </div>
        </div>

        <form
          noValidate
          className="mt-6 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          {authError ? <ErrorState error={authError} title="Sign-in failed" /> : null}

          <Field
            label="Username"
            htmlFor="login-username"
            required
            error={errors.username?.message}
            hint="Use the account issued by your administrator."
          >
            <Input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              placeholder="admin"
              invalid={Boolean(errors.username)}
              aria-describedby={
                errors.username ? "login-username-error" : "login-username-hint"
              }
              {...register("username", {
                onChange: () => {
                  clearFailure();
                },
              })}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="login-password"
            required
            error={errors.password?.message}
          >
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? "login-password-error" : undefined
              }
              {...register("password", {
                onChange: () => {
                  clearFailure();
                },
              })}
            />
          </Field>

          <Button
            type="submit"
            size="lg"
            loading={busy}
            disabled={!isValid}
            className="mt-1 w-full"
          >
            Sign in
          </Button>

          {isDev ? (
            <button
              type="button"
              className="text-xs font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
              onClick={() => {
                clearFailure();
                reset(
                  { username: "admin", password: "admin123" },
                  { keepDefaultValues: true },
                );
              }}
            >
              Fill demo credentials
            </button>
          ) : null}
        </form>
      </Card>

      <div className="w-full max-w-sm space-y-1 text-center">
        {isDev ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Seeded development account:{" "}
            <span className="font-mono text-slate-700 dark:text-slate-300">
              admin / admin123
            </span>
          </p>
        ) : null}

        <p className="text-xs text-slate-400 dark:text-slate-500">
          API base path <span className="font-mono">/api</span> — proxied to the
          backend by the dev server, so there is no CORS configuration to set up.
        </p>
      </div>
    </div>
  );
}
