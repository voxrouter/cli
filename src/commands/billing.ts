import type { Command } from "commander";
import type { SavedPaymentMethod } from "@voxrouter/sdk";
import { CliError, makeClient, type GlobalCliOptions } from "../lib/client.js";
import { dollars, printJsonOr, printList, printWallet } from "../lib/format.js";

interface JsonOption {
  json?: boolean;
}

interface TopupOptions {
  amount: string;
  paymentMethod?: string;
  json?: boolean;
}

export function billingCommand(program: Command): void {
  const billing = program
    .command("billing")
    .description("Wallet balance and saved payment methods.");

  billing
    .command("balance")
    .description("Show wallet snapshot. Same wire endpoint as `voxrouter credits`.")
    .option("--json", "Emit raw JSON instead of a summary")
    .action(async (opts: JsonOption) => {
      const globals = program.opts<GlobalCliOptions>();
      // Same wire endpoint as `voxrouter credits` — the alias on the SDK
      // was dropped in 1.1.0; the CLI alias remains because customers
      // reaching for `voxrouter billing` first deserve to find balance
      // there too. printWallet is the shared formatter.
      const client = await makeClient(globals);
      const wallet = await client.credits.get();
      printWallet(wallet, Boolean(opts.json));
    });

  billing
    .command("methods")
    .description("List saved payment methods (cards) for your organization.")
    .option("--json", "Emit raw JSON instead of a table")
    .action(async (opts: JsonOption) => {
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });
      const methods = await client.billing.listMethods();

      printList<SavedPaymentMethod>({
        rows: methods,
        json: Boolean(opts.json),
        headers: ["ID", "BRAND", "NUMBER", "EXPIRES"],
        project: (m) => [
          m.id,
          m.brand,
          `**** ${m.last4}`,
          `${String(m.expMonth).padStart(2, "0")}/${m.expYear}`,
        ],
        empty:
          "No saved payment methods.\nAdd one in the dashboard: https://voxrouter.ai/app/billing",
      });
    });

  billing
    .command("topup")
    .description("Charge a saved card and credit your wallet.")
    .requiredOption(
      "--amount <usd>",
      "Amount in USD to charge ($10–$1000). Examples: --amount 10, --amount 50",
    )
    .option(
      "--payment-method <id>",
      "Stripe pm_* id of a saved card. If omitted, uses the most recently saved card.",
    )
    .option("--json", "Emit raw JSON instead of a confirmation")
    .action(async (opts: TopupOptions) => {
      const dollarsParsed = Number(opts.amount);
      if (!Number.isFinite(dollarsParsed) || dollarsParsed < 10 || dollarsParsed > 1000) {
        throw new CliError(
          `--amount must be a number between 10 and 1000 USD, got '${opts.amount}'.`,
          2,
        );
      }
      const amountCents = Math.round(dollarsParsed * 100);

      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });

      let paymentMethodId = opts.paymentMethod;
      if (!paymentMethodId) {
        const methods = await client.billing.listMethods();
        if (methods.length === 0) {
          throw new CliError(
            "No saved payment methods. Add one at https://voxrouter.ai/app/billing first.",
            2,
          );
        }
        // listMethods returns Stripe order (most recent first).
        paymentMethodId = methods[0].id;
      }

      // SDK requires an idempotencyKey explicitly. The CLI is the
      // outermost retry boundary — each topup invocation is one
      // logical attempt, so a fresh UUID per invocation is correct.
      const result = await client.billing.topup({
        amountCents,
        paymentMethodId,
        idempotencyKey: crypto.randomUUID(),
      });

      printJsonOr(Boolean(opts.json), result, () => {
        process.stdout.write(
          `Charged ${dollars(amountCents * 1000)} (Stripe ${result.payment_intent_id}).\n` +
            `The webhook will credit your wallet within a few seconds — check\n` +
            `\`voxrouter billing balance\`.\n`,
        );
      });
    });
}
