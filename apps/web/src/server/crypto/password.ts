import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 32768;
const R = 8;
const P = 1;
const KEY_BYTES = 32;
let activeHashes = 0;

export function validatePassword(password: string): void {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 1024
  ) {
    throw new Error("Use a password with at least 12 characters and no more than 1024 bytes.");
  }
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (activeHashes >= 2) throw new Error("Password processing is busy. Try again shortly.");
  activeHashes += 1;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        KEY_BYTES,
        { N, r: R, p: P, maxmem: 64 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      );
    });
  } finally {
    activeHashes -= 1;
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  try {
    return ["scrypt", "1", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
  } finally {
    hash.fill(0);
  }
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 1024) return false;
  const [algorithm, version, n, r, p, saltText, hashText, extra] = stored.split("$");
  if (
    algorithm !== "scrypt" ||
    version !== "1" ||
    Number(n) !== N ||
    Number(r) !== R ||
    Number(p) !== P ||
    extra !== undefined
  )
    return false;
  const salt = Buffer.from(saltText ?? "", "base64"),
    expected = Buffer.from(hashText ?? "", "base64");
  if (
    salt.length !== 16 ||
    expected.length !== KEY_BYTES ||
    salt.toString("base64") !== saltText ||
    expected.toString("base64") !== hashText
  )
    return false;
  const actual = await derive(password, salt);
  try {
    return timingSafeEqual(actual, expected);
  } finally {
    actual.fill(0);
  }
}
