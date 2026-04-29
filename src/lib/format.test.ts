import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dollars, printJsonOr, printList, printWallet, table } from "./format";

interface CapturedWrites {
  stdout: string;
  stderr: string;
}

function captureStdio(): {
  capture: CapturedWrites;
  restore: () => void;
} {
  const capture: CapturedWrites = { stdout: "", stderr: "" };
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    capture.stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    capture.stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stderr.write;
  return {
    capture,
    restore: () => {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
    },
  };
}

let stdio: ReturnType<typeof captureStdio>;
beforeEach(() => {
  stdio = captureStdio();
});
afterEach(() => {
  stdio.restore();
});

describe("table", () => {
  it("pads to column widths and inserts a separator", () => {
    const out = table(["A", "BB"], [["x", "yy"], ["xxx", "y"]]);
    const lines = out.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("A    BB");
    expect(lines[1]).toBe("---  --");
    expect(lines[2]).toBe("x    yy");
    expect(lines[3]).toBe("xxx  y ");
  });
});

describe("dollars", () => {
  it("formats positive micros with $ and 4 decimals", () => {
    expect(dollars(1_000_000)).toBe("$1.0000");
    expect(dollars(1_234_567)).toBe("$1.2346");
  });
  it("preserves sign on negative micros", () => {
    expect(dollars(-500_000)).toBe("-$0.5000");
  });
  it("renders zero without sign", () => {
    expect(dollars(0)).toBe("$0.0000");
  });
});

describe("printJsonOr", () => {
  it("emits pretty JSON to stdout in JSON mode and skips the text fallback", () => {
    const textFn = vi.fn();
    printJsonOr(true, { hello: 1 }, textFn);
    expect(stdio.capture.stdout).toBe('{\n  "hello": 1\n}\n');
    expect(textFn).not.toHaveBeenCalled();
  });
  it("calls the text fallback in non-JSON mode and emits no JSON", () => {
    const textFn = vi.fn(() => process.stdout.write("text!"));
    printJsonOr(false, { hello: 1 }, textFn);
    expect(stdio.capture.stdout).toBe("text!");
    expect(textFn).toHaveBeenCalledOnce();
  });
});

describe("printList", () => {
  it("emits source rows as JSON in JSON mode", () => {
    printList({
      rows: [{ id: 1 }, { id: 2 }],
      json: true,
      headers: ["ID"],
      project: (r) => [String(r.id)],
    });
    expect(JSON.parse(stdio.capture.stdout)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("renders a table in text mode", () => {
    printList({
      rows: [{ id: "a" }, { id: "b" }],
      json: false,
      headers: ["ID"],
      project: (r) => [r.id],
    });
    expect(stdio.capture.stdout).toContain("ID");
    expect(stdio.capture.stdout).toContain("a");
    expect(stdio.capture.stdout).toContain("b");
  });

  it("prints the empty message for an empty rows array in text mode", () => {
    printList({
      rows: [],
      json: false,
      headers: ["ID"],
      project: () => [""],
      empty: "no entries here",
    });
    expect(stdio.capture.stdout.trim()).toBe("no entries here");
  });

  it("falls back to '(none)' when no `empty` is supplied", () => {
    printList({ rows: [], json: false, headers: ["X"], project: () => [""] });
    expect(stdio.capture.stdout.trim()).toBe("(none)");
  });

  it("emits `[]` (not the empty message) for an empty rows array in JSON mode", () => {
    printList({
      rows: [],
      json: true,
      headers: ["X"],
      project: () => [""],
      empty: "should-not-appear",
    });
    expect(JSON.parse(stdio.capture.stdout)).toEqual([]);
    expect(stdio.capture.stdout).not.toContain("should-not-appear");
  });

  it("throws when the projection returns the wrong number of cells (catches header-projection drift)", () => {
    expect(() =>
      printList({
        rows: [{ a: 1 }],
        json: false,
        headers: ["A", "B"],
        project: () => ["just-one-cell"],
      }),
    ).toThrow(/projection returned 1 cells but 2 headers/);
  });
});

describe("printWallet", () => {
  const wallet = { balanceMicros: 5_000_000, reservedMicros: 1_000_000 };

  it("dumps the wire shape unchanged in JSON mode", () => {
    printWallet(wallet, true);
    expect(JSON.parse(stdio.capture.stdout)).toEqual(wallet);
  });

  it("prints Balance / Reserved / Available in text mode, with Available = balance - reserved", () => {
    printWallet(wallet, false);
    expect(stdio.capture.stdout).toContain("Balance:   $5.0000");
    expect(stdio.capture.stdout).toContain("Reserved:  $1.0000");
    expect(stdio.capture.stdout).toContain("Available: $4.0000");
  });
});
