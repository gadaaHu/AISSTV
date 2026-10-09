import { describe, expect, it } from "vitest";
import {
  addDaysToIsoDay,
  formatIsoDay,
  inclusiveDayCount,
  parseTimestamp,
  toIsoDay,
  todayIsoDay,
} from "./dates";

describe("parseTimestamp", () => {
  it("parses an ISO instant with a Z suffix", () => {
    const date = parseTimestamp("2026-09-28T12:00:00Z");
    expect(date?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("parses an ISO instant with a numeric offset", () => {
    const date = parseTimestamp("2026-09-28T15:00:00+03:00");
    expect(date?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("keeps fractional seconds", () => {
    const date = parseTimestamp("2026-09-28T12:00:00.503450+00:00");
    expect(date?.getUTCMilliseconds()).toBe(503);
  });

  it("treats a naive datetime as UTC", () => {
    // The fraud/safety/panic resolve endpoints write datetime.now() without an
    // offset. Reading that as local time would shift the audit timestamp.
    const date = parseTimestamp("2026-09-28T12:00:00");
    expect(date?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("returns null for junk and empty input", () => {
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("   ")).toBeNull();
    expect(parseTimestamp("not-a-date")).toBeNull();
  });
});

describe("calendar days", () => {
  it("formats an ISO day without shifting it", () => {
    // Parsed at UTC midnight and formatted in UTC, so the day shown is the day
    // sent regardless of the viewer's timezone.
    expect(formatIsoDay("2026-09-28")).toContain("28");
    expect(formatIsoDay("2026-01-01")).toContain("1");
  });

  it("returns the input when it cannot be parsed", () => {
    expect(formatIsoDay("nonsense")).toBe("nonsense");
    expect(formatIsoDay(null)).toBe("—");
  });

  it("shifts days on the calendar, not by elapsed time", () => {
    expect(addDaysToIsoDay("2026-09-28", 3)).toBe("2026-10-01");
    expect(addDaysToIsoDay("2026-01-01", -1)).toBe("2025-12-31");
    // A month boundary, which a naive millisecond subtraction can miss.
    expect(addDaysToIsoDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts inclusive days", () => {
    expect(inclusiveDayCount("2026-09-28", "2026-09-28")).toBe(1);
    expect(inclusiveDayCount("2026-09-28", "2026-09-30")).toBe(3);
    expect(inclusiveDayCount("2026-09-30", "2026-09-28")).toBe(0);
  });

  it("round-trips today's local calendar day", () => {
    expect(toIsoDay(new Date())).toBe(todayIsoDay());
    expect(todayIsoDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
