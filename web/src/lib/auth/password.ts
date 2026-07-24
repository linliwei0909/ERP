import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("密碼至少需要 12 個字元");
  }

  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    const [algorithm, cost, blockSize, parallelization, salt, expected] =
      encodedHash.split("$");

    if (
      algorithm !== "scrypt" ||
      !cost ||
      !blockSize ||
      !parallelization ||
      !salt ||
      !expected
    ) {
      return false;
    }

    const expectedBuffer = Buffer.from(expected, "base64url");
    const actualBuffer = await deriveKey(
      password,
      Buffer.from(salt, "base64url"),
      expectedBuffer.length,
      {
        N: Number(cost),
        r: Number(blockSize),
        p: Number(parallelization),
        maxmem: 64 * 1024 * 1024,
      },
    );

    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  } catch {
    return false;
  }
}
