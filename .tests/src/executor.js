"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = void 0;
const child_process_1 = require("child_process");
const VALID_MANAGERS = new Set(["npm", "yarn", "pnpm", "bun"]);
/**
 * Run a package-manager command and stream its output to the terminal.
 * Returns the exit code.
 */
async function execute(manager, args) {
    // Security Layer: Strict validation of the command
    if (!VALID_MANAGERS.has(manager)) {
        console.error(`psync: blocked execution of unauthorized manager "${manager}"`);
        return 1;
    }
    // Security Layer: Block shell metacharacters in arguments to prevent injection
    const containsShellMetachars = args.some(arg => /[\x00-\x1f\x7f\"\'\`;|<>&]/g.test(arg));
    if (containsShellMetachars) {
        console.error("psync: blocked execution due to potential shell injection characters in arguments");
        return 1;
    }
    return new Promise((resolve) => {
        // We avoid { shell: true } to mitigate shell injection risks.
        // On Windows, npm/yarn are often .cmd files. To avoid shell: true, 
        // we use the full name if necessary, but spawn handles it better 
        // when shell is false if you provide the exact filename.
        // However, on Windows, most users have the .cmd files in their PATH.
        const cmd = process.platform === "win32" ? `${manager}.cmd` : manager;
        const child = (0, child_process_1.spawn)(cmd, args, {
            stdio: "inherit",
            // shell: false is implicit and safer
        });
        child.on("error", (err) => {
            // If .cmd failed, try the raw manager name (for bun which is an .exe)
            if (process.platform === "win32" && err.code === 'ENOENT') {
                const fallbackChild = (0, child_process_1.spawn)(manager, args, { stdio: "inherit" });
                fallbackChild.on("error", (e2) => {
                    console.error(`psync: failed to run "${manager}": ${e2.message}`);
                    resolve(1);
                });
                fallbackChild.on("close", (code) => resolve(code ?? 1));
                return;
            }
            console.error(`psync: failed to run "${manager} ${args.join(" ")}": ${err.message}`);
            resolve(1);
        });
        child.on("close", (code) => {
            resolve(code ?? 1);
        });
    });
}
exports.execute = execute;
