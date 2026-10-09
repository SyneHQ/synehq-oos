import { lstatSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { appStore } from "../src/server/store";
import { metadataClient } from "../src/server/store/database";

function requireTerminal(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Use an interactive local terminal for owner passwords.");
}

async function visibleQuestion(label: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(label);
  } finally {
    terminal.close();
  }
}

function passwordQuestion(label: string): Promise<string> {
  requireTerminal();
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    let password = "";
    const originalRaw = process.stdin.isRaw;
    const finish = (error?: Error) => {
      process.stdin.removeListener("data", read);
      process.stdin.setRawMode(originalRaw);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const read = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0003" || character === "\u0004") {
          finish(new Error("Password entry cancelled."));
          return;
        }
        if (character === "\u007f" || character === "\b")
          password = Array.from(password).slice(0, -1).join("");
        else if (character >= " ") password += character;
        if (Buffer.byteLength(password) > 1024) {
          finish(new Error("Password exceeds 1024 bytes."));
          return;
        }
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", read);
  });
}

async function newPassword(): Promise<string> {
  const password = await passwordQuestion("New password: ");
  if ((await passwordQuestion("Repeat password: ")) !== password)
    throw new Error("The passwords do not match.");
  return password;
}

async function run(): Promise<void> {
  process.umask(0o077);
  if (process.argv.length !== 3)
    throw new Error(
      "Use one command: init, setup-token, owner-create, owner-recover, rotate-keys, resume-key-rotation, or restore-authority.",
    );
  const command = process.argv[2];
  const directory = resolve(process.env.OOS_DATA_DIR ?? "data");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error(
      "The data directory must have private permissions and must not be a symbolic link.",
    );
  const store = appStore();
  switch (command) {
    case "init": {
      const instance = await store.initializeMetadata();
      console.log(
        `Installation initialized: ${instance.installationId}. Run setup-token to begin owner setup.`,
      );
      break;
    }
    case "setup-token": {
      const setup = await store.issueSetupToken();
      console.log(
        `Setup token: ${setup.token}\nExpires: ${setup.expiresAt.toISOString()}\nEnter this token on the setup page. Do not place it in a URL.`,
      );
      break;
    }
    case "owner-create": {
      requireTerminal();
      const email = await visibleQuestion("Owner email: "),
        name = await visibleQuestion("Owner name: ");
      await store.createOwnerLocally({ email, name, password: await newPassword() });
      console.log("The owner account was created. Initial setup is now closed.");
      break;
    }
    case "owner-recover": {
      requireTerminal();
      await store.recoverOwnerPassword(await newPassword());
      console.log(
        "The existing owner password was reset. Sessions and pending approvals were revoked.",
      );
      break;
    }
    case "rotate-keys":
    case "resume-key-rotation": {
      const result = await store.rotateSecrets(command === "resume-key-rotation");
      console.log(
        `Rotation complete: ${result.connections} connections and ${result.ai} AI settings. Retain old keys for retained backups.`,
      );
      break;
    }
    case "restore-authority": {
      await store.invalidateRestoredAuthority();
      console.log(
        "Restored sessions, grants, and approvals were invalidated. Unfinished operations have an unknown outcome and will not replay.",
      );
      break;
    }
    default:
      throw new Error("Unknown operator command.");
  }
}

void run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "The operator command failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) await metadataClient().$disconnect();
  });
