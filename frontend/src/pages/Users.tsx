import { useMemo, useState } from "react";

import type { UserOut } from "../api/types";
import { useAuth } from "../auth/useAuth";
import { UserFormDialog } from "../components/users/UserFormDialog";
import { PageHeader } from "../components/PageHeader";
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Pagination,
  Skeleton,
  StatusBadge,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../components/ui";
import {
  useDeactivateUser,
  useUsers,
} from "../hooks/queries/useUsers";
import type { StatusStyle } from "../lib/constants";
import { PAGE_SIZE, isAdmin, roleStyle } from "../lib/constants";
import { errorMessage } from "../lib/utils";

function userStatus(user: UserOut): StatusStyle {
  return user.active
    ? { label: "Active", tone: "success" }
    : { label: "Inactive", tone: "neutral" };
}

interface RowActionsProps {
  user: UserOut;
  admin: boolean;
  onEdit: (user: UserOut) => void;
  onDeactivate: (user: UserOut) => void;
}

function RowActions({
  user,
  admin,
  onEdit,
  onDeactivate,
}: RowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      {admin ? (
        <>
          <IconButton
            icon="pencil"
            label={`Edit ${user.username}`}
            size="sm"
            onClick={() => onEdit(user)}
          />
          <IconButton
            icon="trash"
            label={`Deactivate ${user.username}`}
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            disabled={user.username === "admin"}
            onClick={() => onDeactivate(user)}
          />
        </>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div
      className="flex flex-col gap-2"
      aria-busy="true"
      aria-label="Loading users"
    >
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-3 px-1 py-2">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function UserTable({
  users,
  admin,
  actions,
}: {
  users: UserOut[];
  admin: boolean;
  actions: Omit<RowActionsProps, "user" | "admin">;
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>User</TableHeaderCell>
          <TableHeaderCell>Role</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell align="right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar name={user.full_name ?? user.username ?? "?"} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                    {user.full_name ?? user.username}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user.username}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge style={roleStyle(user.role)} />
            </TableCell>
            <TableCell>
              <StatusBadge style={userStatus(user)} />
            </TableCell>
            <TableCell align="right">
              <RowActions user={user} admin={admin} {...actions} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function UserCards({
  users,
  admin,
  actions,
}: {
  users: UserOut[];
  admin: boolean;
  actions: Omit<RowActionsProps, "user" | "admin">;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {users.map((user) => (
        <li key={user.id}>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <Avatar name={user.full_name ?? user.username ?? "?"} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {user.full_name ?? user.username}
                </p>
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {user.username}
                </p>
              </div>
              <StatusBadge style={userStatus(user)} />
            </div>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500 dark:text-slate-400">Role</dt>
              <dd className="text-slate-700 dark:text-slate-300">
                <StatusBadge style={roleStyle(user.role)} />
              </dd>
            </dl>

            <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
              <RowActions user={user} admin={admin} {...actions} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function Users() {
  const { user: currentUser } = useAuth();
  const admin = isAdmin(currentUser?.role);

  const [activeOnly, setActiveOnly] = useState(false);
  const [offset, setOffset] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserOut | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<UserOut | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      active: activeOnly ? true : undefined,
      limit: PAGE_SIZE.users,
      offset,
    }),
    [activeOnly, offset],
  );

  const { data, isPending, isError, error, isFetching, refetch } =
    useUsers(params.active, Math.floor(offset / PAGE_SIZE.users) + 1, PAGE_SIZE.users);

  const deactivateMutation = useDeactivateUser();

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? PAGE_SIZE.users;
  const currentOffset = data?.offset ?? offset;

  const handleActiveOnlyChange = (next: boolean) => {
    setActiveOnly(next);
    setOffset(0);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (user: UserOut) => {
    setEditing(user);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const confirmDeactivate = () => {
    if (!pendingDeactivate) return;
    setDeactivateError(null);
    deactivateMutation.mutate(pendingDeactivate.username, {
      onSuccess: () => setPendingDeactivate(null),
      onError: (err) => setDeactivateError(errorMessage(err)),
    });
  };

  const rowActions = {
    onEdit: openEdit,
    onDeactivate: (u: UserOut) => {
      setDeactivateError(null);
      setPendingDeactivate(u);
    },
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Console administrators, managers, and viewers."
        actions={
          admin ? (
            <Button variant="primary" onClick={openCreate}>
              Add user
            </Button>
          ) : null
        }
      />

      <Card
        className="mb-4"
        title="Filters"
      >
        <div className="md:w-64">
          <Switch
            id="user-active-only"
            checked={activeOnly}
            onChange={handleActiveOnlyChange}
            label="Active only"
            description="Hide users who have been deactivated."
          />
        </div>
      </Card>

      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p
            aria-live="polite"
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            {isFetching && !isPending
              ? "Refreshing…"
              : `${total} ${total === 1 ? "user" : "users"}`}
          </p>
          <Button
            variant="secondary"
            size="sm"
            loading={isFetching && !isPending}
            onClick={() => {
              void refetch();
            }}
          >
            Refresh
          </Button>
        </div>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          {isPending ? <ListSkeleton /> : null}

          {!isPending && isError ? (
            <ErrorState
              error={error}
              title="Could not load the users"
              onRetry={() => {
                void refetch();
              }}
            />
          ) : null}

          {!isPending && !isError && users.length === 0 ? (
            <EmptyState
              icon="search"
              title="No users found"
              description="There are no users matching this filter."
            />
          ) : null}

          {!isPending && !isError && users.length > 0 ? (
            <>
              <div className="hidden md:block">
                <UserTable
                  users={users}
                  admin={admin}
                  actions={rowActions}
                />
              </div>
              <div className="md:hidden">
                <UserCards
                  users={users}
                  admin={admin}
                  actions={rowActions}
                />
              </div>
            </>
          ) : null}
        </div>

        <Pagination
          total={total}
          limit={limit}
          offset={currentOffset}
          disabled={isFetching}
          itemLabel="users"
          onOffsetChange={setOffset}
        />
      </Card>

      <UserFormDialog
        open={formOpen}
        user={editing}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      />

      <ConfirmDialog
        open={pendingDeactivate !== null}
        title="Deactivate this user?"
        description={
          pendingDeactivate
            ? `${pendingDeactivate.username} will no longer be able to sign in to the console.`
            : undefined
        }
        confirmLabel="Deactivate"
        tone="danger"
        loading={deactivateMutation.isPending}
        onConfirm={confirmDeactivate}
        onClose={() => {
          if (deactivateMutation.isPending) return;
          setPendingDeactivate(null);
          setDeactivateError(null);
        }}
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This is a soft delete: the user remains in the database but access is revoked.
        </p>
        {deactivateError ? (
          <p
            role="alert"
            className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          >
            {deactivateError}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
