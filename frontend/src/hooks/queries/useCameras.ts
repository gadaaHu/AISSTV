import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  createCamera,
  deleteCamera,
  fetchCameras,
  testCamera,
  testCameraUrl,
  updateCamera,
} from "../../api/endpoints";
import type {
  CameraInput,
  CameraTestResult,
  CameraTestUrlRequest,
  CameraUpdate,
} from "../../api/types";
import { useToast } from "../../components/ui";
import { POLL_INTERVAL_MS } from "../../lib/constants";
import { errorMessage } from "../../lib/utils";
import { queryKeys } from "./keys";

/**
 * Camera data layer.
 *
 * Everything the Cameras screen reads or writes goes through this module, so
 * the query key, the invalidation and the toast text are defined once.
 *
 * Two facts about the backend shape the code below:
 *
 * * `GET /cameras` returns a **bare array**, not a `Page`, so there is no
 *   pagination state to thread through.
 * * The probe endpoints (`POST /cameras/{id}/test`, `POST /cameras/test-url`)
 *   answer **HTTP 200 even when the probe fails**. A rejected promise therefore
 *   means "the request did not run", while a resolved promise with `ok: false`
 *   means "the camera is unreachable" — the two are reported very differently.
 */

/** The camera list. A bare `Camera[]`, re-fetched on the shared poll interval. */
export function useCameras(enabledOnly: boolean) {
  return useQuery({
    queryKey: queryKeys.cameras.list(enabledOnly),
    queryFn: ({ signal }) => fetchCameras(enabledOnly, signal),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * Reports a probe result.
 *
 * `POST …/test` resolves for a camera that is down, so success/failure is read
 * from `result.ok` rather than from whether the promise rejected.
 */
function useTestResultToast() {
  const toast = useToast();

  return useCallback(
    (result: CameraTestResult) => {
      if (result.ok) {
        toast.success("Stream OK", result.message);
      } else {
        toast.info("Probe failed", result.message);
      }
    },
    [toast],
  );
}

/** Creates a camera. `POST /cameras`, admin only — the server enforces that. */
export function useCreateCameraMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CameraInput) => createCamera(input),
    onSuccess: (camera) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cameras.all() });
      toast.success(`Camera ${camera.id} added`);
    },
    onError: (error) => {
      toast.error("Could not add camera", errorMessage(error));
    },
  });
}

/** Updates a camera. `PATCH /cameras/{id}`, admin only. */
export function useUpdateCameraMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CameraUpdate }) =>
      updateCamera(id, body),
    onSuccess: (camera) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cameras.all() });
      toast.success(`Camera ${camera.id} saved`);
    },
    onError: (error) => {
      toast.error("Could not save camera", errorMessage(error));
    },
  });
}

/**
 * Deactivates a camera. `DELETE /cameras/{id}`, admin only.
 *
 * The endpoint is **not idempotent**: it answers 404 on a repeat call, so the
 * caller treats `isGone` as "already deleted" and simply refreshes instead of
 * reporting a failure.
 */
export function useDeleteCameraMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCamera(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cameras.all() });
    },
  });
}

/** Probes a **stored** camera. Slow (up to ~10 s) and 200-on-failure. */
export function useTestCameraMutation() {
  const showResult = useTestResultToast();

  return useMutation({
    mutationFn: (id: string) => testCamera(id),
    onSuccess: showResult,
  });
}

/** Probes a URL that has not been saved yet, for the create form. */
export function useTestCameraUrlMutation() {
  const showResult = useTestResultToast();

  return useMutation({
    mutationFn: (body: CameraTestUrlRequest) => testCameraUrl(body),
    onSuccess: showResult,
  });
}
