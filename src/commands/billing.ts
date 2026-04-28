import type { Command } from "commander";
import type { SavedPaymentMethod } from "@voxrouter/sdk";
import { CliError, makeClient, type GlobalCliOptions } from "../lib/client.js";
import { dollars, table } from "../lib/format.js";

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
    .description("Show wallet snapshot. Alias for `voxrouter credits`.")
    .option("--json", "Emit raw JSON instead of a summary")
    .action(async (opts: JsonOption) => {
      const globals = program.opts<GlobalCliOptions>();
      // Balance is data-plane (pk_*) — same as `voxrouter credits`.
      // Living under the billing namespace is a discoverability win for
      // first-time users who reach for `voxrouter billing` first.
      const client = await makeClient(globals);
      const wallet = await client.billing.getBalance();

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(wallet, null, 2)}\n`);
        return;
      }

      const available = wallet.balanceMicros - wallet.reservedMicros;
      process.stdout.write(
        `Balance:   ${dollars(wallet.balanceMicros)}\n` +
          `Reserved:  ${dollars(wallet.reservedMicros)}\n` +
          `Available: ${dollars(available)}\n`,
      );
    });

  billing
    .command("methods")
    .description("List saved payment methods (cards) for your organization.")
    .option("--json", "Emit raw JSON instead of a table")
    .action(async (opts: JsonOption) => {
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });
      const methods = await client.billing.listMethods();

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(methods, null, 2)}\n`);
        return;
      }

      if (methods.length === 0) {
        process.stdout.write(
          "No saved payment methods.\nAdd one in the dashboard: https://voxrouter.ai/app/billing\n",
        );
        return;
      }

      const rows = methods.map((m: SavedPaymentMethod) => [
        m.id,
        m.brand,
        `**** ${m.last4}`,
        `${String(m.expMonth).padStart(2, "0")}/${m.expYear}`,
      ]);
      process.stdout.write(
        `${table(["ID", "BRAND", "NUMBER", "EXPIRES"], rows)}\n`,
      );
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

      const result = await client.billing.topup({ amountCents, paymentMethodId });

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }
      process.stdout.write(
        `Charged ${dollars(amountCents * 1000)} (Stripe ${result.payment_intent_id}).\n` +
          `The webhook will credit your wallet within a few seconds — check\n` +
          `\`voxrouter billing balance\`.\n`,
      );
    });
}
