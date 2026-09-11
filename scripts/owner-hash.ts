#!/usr/bin/env -S pnpm exec tsx
/**
 * Prints a `scrypt$...` hash for `OWNER_PASSWORD_HASH`.
 *
 * Usage:
 *   pnpm owner:hash 'my-password'
 *   pnpm owner:hash            # prompts for the password on stdin (not echoed)
 */
import { createInterface } from "node:readline";
import { hashPassword } from "../apps/web/src/lib/owner-auth.js";

async function promptForPassword(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // `readline` has no built-in masking; muting the output stream while the prompt is answered
    // keeps the password off the terminal without pulling in a dependency for this one script.
    // biome-ignore lint/suspicious/noExplicitAny: patching a private readline internal for masking
    const rlAny = rl as any;
    const originalWrite = rlAny._writeToOutput?.bind(rl);
    if (originalWrite) {
      rlAny._writeToOutput = (chunk: string) => {
        if (chunk.includes("\n") || chunk.includes("\r")) originalWrite(chunk);
      };
    }
    rl.question("Password: ", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    rl.on("error", reject);
  });
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const password = arg ?? (await promptForPassword());
  if (!password) {
    console.error("Usage: pnpm owner:hash '<password>'");
    process.exitCode = 1;
    return;
  }
  console.log(hashPassword(password));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
