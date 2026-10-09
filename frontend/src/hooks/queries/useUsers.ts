import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createUser,
  deactivateUser,
  fetchUsers,
  updateUser,
} from "../../api/endpoints";
import type { UserInput, UserUpdate } from "../../api/types";
import { queryKeys } from "./keys";

export function useUsers(active: boolean | undefined, page: number, limit: number) {
  const offset = (page - 1) * limit;

  return useQuery({
    queryKey: queryKeys.users.list({ active, limit, offset }),
    queryFn: ({ signal }) => fetchUsers({ active, limit, offset }, signal),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UserInput) => createUser(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ username, body }: { username: string; body: UserUpdate }) =>
      updateUser(username, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (username: string) => deactivateUser(username),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
  });
}
