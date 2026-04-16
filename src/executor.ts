import { spawn } from "child_process";
import { PackageManager } from "./detector";

/**
 * Run a package-manager command and stream its output to the terminal.
 * Returns the exit code.
 */
export function execute(
  manager: PackageManager,
  args: string[]
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(manager, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", (err) => {
      console.error(`psync: failed to run "${manager} ${args.join(" ")}": ${err.message}`);
      resolve(1);
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}
