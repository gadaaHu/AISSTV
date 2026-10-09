import { useMemo, useState } from "react";

import type { AttendanceRecord, Employee } from "../api/types";
import { useAuth } from "../auth/useAuth";
import { EmployeeFormDialog } from "../components/employees/EmployeeFormDialog";
import { FaceUploadDialog } from "../components/employees/FaceUploadDialog";
import { PageHeader } from "../components/PageHeader";
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
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
  useDeleteEmployee,
  useEmployeeAttendance,
  useEmployees,
} from "../hooks/queries/useEmployees";
import { useDebouncedValue } from "../hooks/useDebounce";
import type { StatusStyle } from "../lib/constants";
import { PAGE_SIZE, attendanceStyle, isAdmin } from "../lib/constants";
import {
  addDaysToIsoDay,
  formatIsoDay,
  formatTime,
  todayIsoDay,
} from "../lib/dates";
import { formatText } from "../lib/format";
import { errorMessage } from "../lib/utils";

/**
 * The employee console.
 *
 * One screen owns the list, its filters and the three dialogs that act on a
 * row: edit, face photo and attendance history. The data layer lives in
 * `src/hooks/queries/useEmployees.ts`, so this file only decides what to show.
 */

/** The history window: the last 30 calendar days, today included. */
const HISTORY_DAYS = 30;

/** `"09:00:00"` → `"09:00"`. A shift is wall-clock, so the seconds are noise. */
function trimSeconds(value: string): string {
  const [hours, minutes] = value.trim().split(":");
  if (!hours || !minutes) return value;
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function employeeStatus(employee: Employee): StatusStyle {
  return employee.active
    ? { label: "Active", tone: "success" }
    : { label: "Inactive", tone: "neutral" };
}

function departmentLine(employee: Employee): string {
  return `${formatText(employee.department)} • ${formatText(employee.title)}`;
}

function shiftLine(employee: Employee): string {
  return `${trimSeconds(employee.shift_start)}–${trimSeconds(employee.shift_end)}`;
}

/* ------------------------------------------------------------ row actions */

interface RowActionsProps {
  employee: Employee;
  admin: boolean;
  onViewHistory: (employee: Employee) => void;
  onUploadFace: (employee: Employee) => void;
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
}

/** Edit, delete and the face photo are admin-only; history is readable by all. */
type RowActionHandlers = Omit<RowActionsProps, "employee" | "admin">;

function RowActions({
  employee,
  admin,
  onViewHistory,
  onUploadFace,
  onEdit,
  onDelete,
}: RowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton
        icon="clock"
        label={`Attendance history for ${employee.name}`}
        size="sm"
        onClick={() => onViewHistory(employee)}
      />
      {admin ? (
        <>
          <IconButton
            icon="image"
            label={`Upload a face photo for ${employee.name}`}
            size="sm"
            onClick={() => onUploadFace(employee)}
          />
          <IconButton
            icon="pencil"
            label={`Edit ${employee.name}`}
            size="sm"
            onClick={() => onEdit(employee)}
          />
          <IconButton
            icon="trash"
            label={`Deactivate ${employee.name}`}
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            onClick={() => onDelete(employee)}
          />
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------- attendance history */

function HistoryTable({ records }: { records: AttendanceRecord[] }) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Day</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Check in</TableHeaderCell>
          <TableHeaderCell>Check out</TableHeaderCell>
          <TableHeaderCell align="right">Late</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {records.map((record) => (
          <TableRow key={record.id}>
            <TableCell className="whitespace-nowrap">
              {formatIsoDay(record.day)}
            </TableCell>
            <TableCell>
              <StatusBadge style={attendanceStyle(record.status)} />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {record.check_in ? formatTime(record.check_in) : "—"}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {record.check_out ? formatTime(record.check_out) : "—"}
            </TableCell>
            <TableCell align="right" className="whitespace-nowrap">
              {record.minutes_late > 0 ? `${record.minutes_late} min` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * `fetchEmployeeAttendance` needs **both** bounds and answers with a bare
 * array, not a page: the window is always the last 30 calendar days.
 */
function AttendanceHistoryDialog({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  const end = todayIsoDay();
  const start = addDaysToIsoDay(end, -(HISTORY_DAYS - 1));

  const { data, isPending, isError, error, refetch } = useEmployeeAttendance(
    employee.code,
    start,
    end,
  );

  // Sorted here rather than trusting the server's ordering, so the newest day
  // is always first.
  const records = useMemo(
    () =>
      [...(data ?? [])].sort((left, right) => right.day.localeCompare(left.day)),
    [data],
  );

  const body = (() => {
    if (isPending) {
      return (
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only">Loading attendance history</span>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-5/6" />
          <Skeleton className="h-8 w-full" />
        </div>
      );
    }

    if (isError) {
      return (
        <ErrorState
          error={error}
          title="Could not load the attendance history"
          onRetry={() => {
            void refetch();
          }}
        />
      );
    }

    if (records.length === 0) {
      return (
        <EmptyState
          icon="clock"
          title="No attendance in the last 30 days"
          description={`${employee.name} has no recorded attendance between ${formatIsoDay(start)} and ${formatIsoDay(end)}.`}
        />
      );
    }

    return <HistoryTable records={records} />;
  })();

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Attendance history — ${employee.name}`}
      description={`${formatIsoDay(start)} to ${formatIsoDay(end)} · code ${employee.code}`}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {body}
    </Modal>
  );
}

/* -------------------------------------------------------------- the list */

function ListSkeleton() {
  return (
    <div
      className="flex flex-col gap-2"
      aria-busy="true"
      aria-label="Loading employees"
    >
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex items-center gap-3 px-1 py-2">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function EmployeeTable({
  employees,
  admin,
  actions,
}: {
  employees: Employee[];
  admin: boolean;
  actions: RowActionHandlers;
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Employee</TableHeaderCell>
          <TableHeaderCell>Code</TableHeaderCell>
          <TableHeaderCell>Department</TableHeaderCell>
          <TableHeaderCell>Shift</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell align="right">Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {employees.map((employee) => (
          <TableRow key={employee.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar name={employee.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                    {employee.name}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {formatText(employee.email)}
                  </p>
                </div>
              </div>
            </TableCell>

            <TableCell>
              <span className="font-mono text-xs">{employee.code}</span>
            </TableCell>

            <TableCell>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {departmentLine(employee)}
              </span>
            </TableCell>

            <TableCell>
              <span className="font-mono text-xs whitespace-nowrap">
                {shiftLine(employee)}
              </span>
            </TableCell>

            <TableCell>
              <StatusBadge style={employeeStatus(employee)} />
            </TableCell>

            <TableCell align="right">
              <RowActions employee={employee} admin={admin} {...actions} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Below `md` the same rows are stacked as cards instead of a squeezed table. */
function EmployeeCards({
  employees,
  admin,
  actions,
}: {
  employees: Employee[];
  admin: boolean;
  actions: RowActionHandlers;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {employees.map((employee) => (
        <li key={employee.id}>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <Avatar name={employee.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {employee.name}
                </p>
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {employee.code}
                </p>
              </div>
              <StatusBadge style={employeeStatus(employee)} />
            </div>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500 dark:text-slate-400">Department</dt>
              <dd className="text-slate-700 dark:text-slate-300">
                {departmentLine(employee)}
              </dd>

              <dt className="text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="break-all text-slate-700 dark:text-slate-300">
                {formatText(employee.email)}
              </dd>

              <dt className="text-slate-500 dark:text-slate-400">Shift</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300">
                {shiftLine(employee)}
              </dd>
            </dl>

            <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
              <RowActions employee={employee} admin={admin} {...actions} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function Employees() {
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [offset, setOffset] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [faceEmployee, setFaceEmployee] = useState<Employee | null>(null);
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const params = useMemo(
    () => ({
      q: debouncedSearch,
      // `undefined` drops the parameter entirely; `false` would ask for
      // inactive-only, which is not what the switch offers.
      active: activeOnly ? true : undefined,
      limit: PAGE_SIZE.employees,
      offset,
    }),
    [debouncedSearch, activeOnly, offset],
  );

  const { data, isPending, isError, error, isFetching, refetch } =
    useEmployees(params);

  const deleteMutation = useDeleteEmployee();

  // Hiding an action is a convenience only: the server re-checks the role on
  // every mutation, so this is never what actually protects the data.
  const admin = isAdmin(user?.role);

  const employees = data?.items ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? PAGE_SIZE.employees;
  const currentOffset = data?.offset ?? offset;

  const isFiltered = Boolean(debouncedSearch.trim()) || activeOnly;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    // Any filter change invalidates the current page number.
    setOffset(0);
  };

  const handleActiveOnlyChange = (next: boolean) => {
    setActiveOnly(next);
    setOffset(0);
  };

  const clearFilters = () => {
    setSearch("");
    setActiveOnly(false);
    setOffset(0);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    deleteMutation.mutate(pendingDelete.code, {
      onSuccess: () => setPendingDelete(null),
      onError: (mutationError) => setDeleteError(errorMessage(mutationError)),
    });
  };

  const rowActions: RowActionHandlers = {
    onViewHistory: (employee) => setHistoryEmployee(employee),
    onUploadFace: (employee) => setFaceEmployee(employee),
    onEdit: openEdit,
    onDelete: (employee) => {
      setDeleteError(null);
      setPendingDelete(employee);
    },
  };

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone the cameras can recognise, with their shift times and attendance history."
        actions={
          admin ? (
            <Button variant="primary" onClick={openCreate}>
              Add employee
            </Button>
          ) : null
        }
      />

      <Card
        className="mb-4"
        title="Filters"
        description="The server matches the search case-insensitively against both the code and the name."
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex flex-1 flex-col gap-1.5">
            <label
              htmlFor="employee-search"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Search
            </label>
            <Input
              id="employee-search"
              type="search"
              value={search}
              placeholder="Code or name"
              autoComplete="off"
              aria-describedby="employee-search-hint"
              onChange={(event) => handleSearchChange(event.target.value)}
            />
            <p
              id="employee-search-hint"
              className="text-xs text-slate-500 dark:text-slate-400"
            >
              Filters once you pause typing.
            </p>
          </div>

          <div className="md:w-64">
            <Switch
              id="employee-active-only"
              checked={activeOnly}
              onChange={handleActiveOnlyChange}
              label="Active only"
              description="Hide employees who have been deactivated."
            />
          </div>
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
              : `${total} ${total === 1 ? "employee" : "employees"}`}
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
              title="Could not load the employees"
              onRetry={() => {
                void refetch();
              }}
            />
          ) : null}

          {!isPending && !isError && employees.length === 0 ? (
            isFiltered ? (
              <EmptyState
                icon="search"
                title="No matches for this search"
                description="Nothing matches the current search and Active-only filter. Try a different code or name, or clear the filters."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon="employees"
                title="No employees yet"
                description="Nothing has been registered against this console. Add the first employee to start matching faces."
                action={
                  admin ? (
                    <Button variant="primary" size="sm" onClick={openCreate}>
                      Add employee
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : null}

          {!isPending && !isError && employees.length > 0 ? (
            <>
              <div className="hidden md:block">
                <EmployeeTable
                  employees={employees}
                  admin={admin}
                  actions={rowActions}
                />
              </div>
              <div className="md:hidden">
                <EmployeeCards
                  employees={employees}
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
          itemLabel="employees"
          onOffsetChange={setOffset}
        />
      </Card>

      <EmployeeFormDialog
        open={formOpen}
        employee={editing}
        onClose={closeForm}
      />

      {faceEmployee ? (
        <FaceUploadDialog
          open
          employee={faceEmployee}
          onClose={() => setFaceEmployee(null)}
        />
      ) : null}

      {historyEmployee ? (
        <AttendanceHistoryDialog
          employee={historyEmployee}
          onClose={() => setHistoryEmployee(null)}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Deactivate this employee?"
        description={
          pendingDelete
            ? `${pendingDelete.name} (${pendingDelete.code}) keeps their attendance history but stops being scored.`
            : undefined
        }
        confirmLabel="Deactivate"
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onClose={() => {
          if (deleteMutation.isPending) return;
          setPendingDelete(null);
          setDeleteError(null);
        }}
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This is a soft delete: the server keeps the row, so past attendance
          reports stay intact.
        </p>
        {deleteError ? (
          <p
            role="alert"
            className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          >
            {deleteError}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
