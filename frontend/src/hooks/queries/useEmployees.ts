import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { POLL_INTERVAL_MS } from "../../lib/constants";
import {
  createEmployee,
  deleteEmployee,
  fetchEmployee,
  fetchEmployeeAttendance,
  fetchEmployees,
  updateEmployee,
  uploadFace,
} from "../../api/endpoints";
import type { EmployeeInput, EmployeeUpdate } from "../../api/types";
import { useToast } from "../../components/ui";
import { errorMessage } from "../../lib/utils";
import { queryKeys } from "./keys";

/**
 * Employee queries and mutations.
 *
 * Screens never call `src/api/endpoints.ts` directly: every request a screen
 * makes goes through one of these hooks, so cache keys, polling and the
 * post-mutation invalidation are declared once rather than per call site.
 */

export interface EmployeeListParams {
  q: string;
  active: boolean | undefined;
  limit: number;
  offset: number;
}

export function useEmployees(params: EmployeeListParams) {
  return useQuery({
    queryKey: queryKeys.employees.list(params),
    queryFn: ({ signal }) => fetchEmployees(params, signal),
    // Keeps the previous page on screen while the next one loads, so paging and
    // the debounced search do not flash an empty table.
    placeholderData: keepPreviousData,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useEmployee(code: string | null) {
  return useQuery({
    queryKey: queryKeys.employees.detail(code ?? ""),
    queryFn: ({ signal }) => fetchEmployee(code ?? "", signal),
    enabled: Boolean(code),
  });
}

/**
 * Attendance history for one employee.
 *
 * `fetchEmployeeAttendance` answers with a **bare array** and the server
 * requires **both** bounds, so the request is only issued once a code and both
 * days are present.
 */
export function useEmployeeAttendance(
  code: string | null,
  start: string,
  end: string,
) {
  return useQuery({
    queryKey: queryKeys.attendance.history(code ?? ""),
    queryFn: ({ signal }) => fetchEmployeeAttendance(code ?? "", start, end, signal),
    enabled: Boolean(code) && Boolean(start) && Boolean(end),
  });
}

export function useCreateEmployee(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: EmployeeInput) => createEmployee(input),
    onSuccess: (employee) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.employees.all(),
      });
      toast.success(
        "Employee created",
        `${employee.name} (${employee.code}) was added.`,
      );
      onSuccess?.();
    },
    onError: (error) => {
      toast.error("Could not create the employee", errorMessage(error));
    },
  });
}

export function useUpdateEmployee(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ code, body }: { code: string; body: EmployeeUpdate }) =>
      updateEmployee(code, body),
    onSuccess: (employee) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.employees.all(),
      });
      toast.success(
        "Employee updated",
        `${employee.name} (${employee.code}) was saved.`,
      );
      onSuccess?.();
    },
    onError: (error) => {
      toast.error("Could not save the employee", errorMessage(error));
    },
  });
}

/**
 * Soft-deletes by default: the server keeps the row and its attendance history
 * so past reports stay readable.
 */
export function useDeleteEmployee(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (code: string) => deleteEmployee(code),
    onSuccess: (_result, code) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.employees.all(),
      });
      toast.success("Employee deactivated", `${code} was deactivated.`);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error("Could not deactivate the employee", errorMessage(error));
    },
  });
}

/**
 * The face upload is its own mutation so the dialog can own its own busy and
 * error state instead of borrowing the form's.
 */
export function useUploadFace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, file }: { code: string; file: File }) =>
      uploadFace(code, file),
    onSuccess: () => {
      // The list itself does not change, but a detail view may show the photo
      // path, so the whole branch is refreshed.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.employees.all(),
      });
    },
  });
}
