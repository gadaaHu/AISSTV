import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearToken,
  getToken,
  request,
  requestBlob,
  requestVoid,
  setToken,
  setUnauthorizedHandler,
} from "./client";
import { ApiError } from "./errors";

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

/** The captured `RequestInit` of the n-th fetch call. */
function initOf(index = 0): RequestInit {
  return fetchMock.mock.calls[index]?.[1] as RequestInit;
}

function urlOf(index = 0): string {
  return fetchMock.mock.calls[index]?.[0] as string;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearToken();
  setUnauthorizedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
  clearToken();
});

describe("request URL and headers", () => {
  it("builds the query string and omits empty values", async () => {
    fetchMock.mockResolvedValue(json({ items: [] }));

    await request("/employees", {
      query: { q: "", active: true, limit: 50, offset: undefined, status: null },
    });

    // The server treats "" as a value, so status filters must be dropped rather
    // than sent as empty.
    expect(urlOf()).toBe("/api/employees?active=true&limit=50");
  });

  it("attaches the bearer token from storage", async () => {
    setToken("t0ken");
    fetchMock.mockResolvedValue(json({}));

    await request("/auth/me");

    const headers = initOf().headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer t0ken");
  });

  it("omits the token for unauthenticated calls", async () => {
    setToken("t0ken");
    fetchMock.mockResolvedValue(json({ access_token: "x" }));

    await request("/auth/login", { method: "POST", auth: false });

    expect((initOf().headers as Headers).get("Authorization")).toBeNull();
  });
});

describe("form encoding", () => {
  it("sends the login body as url-encoded form data", async () => {
    fetchMock.mockResolvedValue(json({ access_token: "x" }));

    await request("/auth/login", {
      method: "POST",
      auth: false,
      form: { username: "admin", password: "admin123" },
    });

    const init = initOf();
    expect((init.headers as Headers).get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(init.body).toBe("username=admin&password=admin123");
  });

  it("escapes a plus sign so it is not decoded as a space", async () => {
    fetchMock.mockResolvedValue(json({ access_token: "x" }));

    await request("/auth/login", {
      method: "POST",
      auth: false,
      form: { username: "a", password: "p+ss word" },
    });

    // The old hand-built string lost a "+" in the password. URLSearchParams
    // encodes it as %2B, which the server decodes back to "+".
    expect(initOf().body).toBe("username=a&password=p%2Bss+word");
  });

  it("does not set Content-Type for a multipart upload", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["jpeg-bytes"]), "face.jpg");
    fetchMock.mockResolvedValue(json({ message: "saved", path: "uploads/x.jpg" }));

    await request("/employees/emp-001/face", { method: "POST", formData });

    // The browser must add the multipart boundary itself; setting the header by
    // hand would omit it and the server would reject the body.
    const init = initOf();
    expect((init.headers as Headers).has("Content-Type")).toBe(false);
    expect(init.body).toBe(formData);
  });
});

describe("empty responses", () => {
  it("returns undefined for 204 without trying to decode a body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(request("/leaves/abc", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("resolves requestVoid for a 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      requestVoid("/auth/change-password", { method: "POST", json: {} }),
    ).resolves.toBeUndefined();
  });

  it("handles a 200 with an empty body", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    await expect(request("/employees")).resolves.toBeUndefined();
  });
});

describe("error mapping", () => {
  it("surfaces the backend detail message", async () => {
    fetchMock.mockResolvedValue(
      json(
        { error: "conflict", detail: "Overlapping leave request already exists" },
        { status: 409 },
      ),
    );

    await expect(request("/leaves", { method: "POST", json: {} })).rejects.toMatchObject({
      code: "conflict",
      message: "Overlapping leave request already exists",
    });
  });

  it("clears the session and notifies the handler on 401", async () => {
    setToken("t0ken");
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(
      json({ error: "unauthorized", detail: "Invalid or expired token" }, { status: 401 }),
    );

    await expect(request("/auth/me")).rejects.toBeInstanceOf(ApiError);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
  });

  it("treats a plain-text proxy error as the message", async () => {
    fetchMock.mockResolvedValue(new Response("502 Bad Gateway", { status: 502 }));

    await expect(request("/x")).rejects.toMatchObject({
      code: "server",
      message: "502 Bad Gateway",
    });
  });

  it("reports a transport failure as a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await request("/health").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("network");
    expect((error as ApiError).isConnectivityProblem).toBe(true);
  });
});

describe("cancellation", () => {
  it("reports the request-level timeout distinctly", async () => {
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const error = await request("/slow", { timeoutMs: 5 }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("timeout");
  });

  it("reports a caller abort as aborted, not as a timeout", async () => {
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const controller = new AbortController();
    const pending = request("/slow", { signal: controller.signal, timeoutMs: 5000 });
    controller.abort();

    const error = await pending.catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("aborted");
    expect((error as ApiError).isAborted).toBe(true);
  });
});

describe("binary responses", () => {
  it("returns a blob for the camera snapshot", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Blob(["jpeg-bytes"]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );

    const blob = await requestBlob("/cameras/cam-01/snapshot");

    expect(blob).toBeInstanceOf(Blob);
    expect((initOf().headers as Headers).get("Accept")).toBe("image/*");
  });
});
