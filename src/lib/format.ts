import type { WalletSnapshot } from "@voxrouter/sdk";

/** Render a 2-D table of headers + rows as a single string, padded to
 *  column widths. Used by `printList` in text mode and by ad-hoc table
 *  printers (usage, etc.). */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const fmt = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  return [fmt(headers), sep, ...rows.map(fmt)].join("\n");
}

/** Format USD micro-dollars (1_000_000 = $1.00) with sign and 4 decimals
 *  so sub-cent ledger entries (typical for per-character TTS billing) are
 *  visible. */
export function dollars(micros: number): string {
  const sign = micros < 0 ? "-" : "";
  const abs = Math.abs(micros) / 1_000_000;
  return `${sign}$${abs.toFixed(4)}`;
}

/** "Emit JSON or run the text fallback" — the dispatcher every command
 *  needs but nobody wants to repeat. JSON mode writes pretty JSON to
 *  stdout with a trailing newline; text mode invokes `textFn`. */
export function printJsonOr(
  json: boolean,
  value: unknown,
  textFn: () => void,
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  textFn();
}

interface PrintListArgs<T> {
  rows: T[];
  json: boolean;
  headers: string[];
  /** One cell per header; called only in text mode. */
  project: (row: T) => string[];
  /** Message for an empty list in text mode. Default: "(none)". */
  empty?: string;
}

/** List-of-rows output. JSON mode prints the source rows as-is. Text
 *  mode prints a table; an empty list prints `empty` instead. The
 *  projection's cell count is checked against `headers.length` and a
 *  noisy throw fires on mismatch — we'd rather crash than silently
 *  truncate user-visible output. */
export function printList<T>(args: PrintListArgs<T>): void {
  printJsonOr(args.json, args.rows, () => {
    if (args.rows.length === 0) {
      process.stdout.write(`${args.empty ?? "(none)"}\n`);
      return;
    }
    const tableRows = args.rows.map((row) => {
      const cells = args.project(row);
      if (cells.length !== args.headers.length) {
        throw new Error(
          `printList projection returned ${cells.length} cells but ` +
            `${args.headers.length} headers were given`,
        );
      }
      return cells;
    });
    process.stdout.write(`${table(args.headers, tableRows)}\n`);
  });
}

/** Wallet snapshot output. JSON mode dumps the wire shape unchanged.
 *  Text mode prints Balance / Reserved / Available — used by
 *  `voxrouter credits` and `voxrouter billing balance` (same wire
 *  endpoint, two surface names, one printer). */
export function printWallet(snapshot: WalletSnapshot, json: boolean): void {
  printJsonOr(json, snapshot, () => {
    const available = snapshot.balanceMicros - snapshot.reservedMicros;
    process.stdout.write(
      `Balance:   ${dollars(snapshot.balanceMicros)}\n` +
        `Reserved:  ${dollars(snapshot.reservedMicros)}\n` +
        `Available: ${dollars(available)}\n`,
    );
  });
}
