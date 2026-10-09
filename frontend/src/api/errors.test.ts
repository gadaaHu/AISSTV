import { describe, expect, it } from "vitest";
import { ApiError, parseErrorBody } from "./errors";

describe("ApiError.fromResponse", () => {
  it("maps the backend error envelope", () => {
    const error = ApiError.fromResponse(409, {
      error: "conflict",
      detail: "Employee code already exists",
    });
    expect(error.code).toBe("conflict");
    expect(error.status).toBe(409);
    expect(error.message).toBe("Employee code already exists");
    expect(error.detail).toBe("Employee code already exists");
  });

  it("maps a missing Authorization header (a bare detail body)", () => {
    const error = ApiError.fromResponse(401, { detail: "Not authenticated" });
    expect(error.code).toBe("unauthorized");
    expect(error.isUnauthorized).toBe(true);
  });

  it("treats the generic 422 body as validation", () => {
    // The server returns no field-level information for a 422, which is why the
    // forms validate client-side.
    const error = ApiError.fromResponse(422, {
      error: "validation_error",
      detail: "Invalid request",
    });
    expect(error.code).toBe("validation");
    expect(error.message).toBe("Invalid request");
  });

  it("classifies each status", () => {
    expect(ApiError.fromResponse(400, null).code).toBe("validation");
    expect(ApiError.fromResponse(403, null).code).toBe("forbidden");
    expect(ApiError.fromResponse(404, null).code).toBe("notFound");
    expect(ApiError.fromResponse(500, null).code).toBe("server");
    expect(ApiError.fromResponse(502, null).code).toBe("server");
    expect(ApiError.fromResponse(418, null).code).toBe("unknown");
  });

  it("prefers the explicit error code over the status", () => {
    const error = ApiError.fromResponse(401, { error: "forbidden" });
    expect(error.code).toBe("forbidden");
  });

  it("falls back to a readable message when there is no body", () => {
    expect(ApiError.fromResponse(404, null).message).toMatch(/no longer exists/i);
    expect(ApiError.fromResponse(500, null).message).toMatch(/server failed/i);
  });

  it("carries the request id for correlation", () => {
    const error = ApiError.fromResponse(500, null, "req-123");
    expect(error.requestId).toBe("req-123");
  });

  it("distinguishes connectivity problems from refusals", () => {
    expect(ApiError.network("down").isConnectivityProblem).toBe(true);
    expect(ApiError.timeout().isConnectivityProblem).toBe(true);
    expect(ApiError.fromResponse(404, null).isConnectivityProblem).toBe(false);
    expect(ApiError.aborted().isAborted).toBe(true);
    expect(ApiError.fromResponse(404, null).isGone).toBe(true);
  });
});

describe("parseErrorBody", () => {
  it("reads detail and error from an object", () => {
    expect(parseErrorBody({ error: "conflict", detail: "Nope" })).toEqual({
      detail: "Nope",
      error: "conflict",
    });
  });

  it("treats a bare string body as the detail", () => {
    expect(parseErrorBody("Bad gateway")).toEqual({ detail: "Bad gateway" });
  });

  it("ignores empty and non-string values", () => {
    expect(parseErrorBody(null)).toEqual({});
    expect(parseErrorBody("")).toEqual({});
    expect(parseErrorBody(42)).toEqual({});
    expect(parseErrorBody({ detail: 42, error: [] })).toEqual({});
  });

  it("returns nothing for an empty object", () => {
    expect(parseErrorBody({})).toEqual({});
  });
});
