import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatPercent,
  hasUrlCredentials,
  humanise,
  initialsFrom,
  redactUrlCredentials,
} from "./format";

describe("formatDuration", () => {
  it("renders hours and minutes", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(4800)).toBe("1h 20m");
    expect(formatDuration(2700)).toBe("45m");
    expect(formatDuration(30)).toBe("30s");
  });

  it("returns a dash for zero or missing values", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("treats the value as a 0–1 fraction", () => {
    expect(formatPercent(0.923)).toBe("92%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("returns a dash for missing values", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("camera URL redaction", () => {
  it("strips embedded credentials", () => {
    // The API returns the raw stream URL to every authenticated user, so the
    // list must never render it verbatim.
    const redacted = redactUrlCredentials("rtsp://admin:secret@192.168.1.100:554/s1");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("admin");
    expect(redacted).toContain("192.168.1.100:554/s1");
  });

  it("leaves a credential-free URL untouched", () => {
    const url = "rtsp://192.168.1.100:554/s1";
    expect(redactUrlCredentials(url)).toBe(url);
  });

  it("falls back to a placeholder for an unparseable URL with an @", () => {
    expect(redactUrlCredentials("rtsp://user:pass@[bad")).toBe(
      "•••• (credentials hidden)",
    );
  });

  it("detects embedded credentials", () => {
    expect(hasUrlCredentials("rtsp://admin:secret@host/path")).toBe(true);
    expect(hasUrlCredentials("rtsp://admin@host/path")).toBe(true);
    expect(hasUrlCredentials("rtsp://host/path")).toBe(false);
    expect(hasUrlCredentials("not a url")).toBe(false);
  });
});

describe("text helpers", () => {
  it("humanises snake and kebab case", () => {
    expect(humanise("half_day")).toBe("Half day");
    expect(humanise("main-entrance")).toBe("Main entrance");
    expect(humanise(null)).toBe("—");
  });

  it("builds at most two initials", () => {
    expect(initialsFrom("Abebe Kebede")).toBe("AK");
    expect(initialsFrom("Sara")).toBe("S");
    expect(initialsFrom("  ")).toBe("?");
    expect(initialsFrom(null)).toBe("?");
  });
});
