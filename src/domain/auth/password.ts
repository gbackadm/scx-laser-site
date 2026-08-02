import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const keyLength = 64;
const scryptOptions = {
  N: 131_072,
  r: 8,
  p: 1,
  maxmem: 160 * 1024 * 1024,
};

function scryptAsync(
  password: string,
  salt: Buffer,
  length: number,
  options: typeof scryptOptions,
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(
    password,
    salt,
    keyLength,
    scryptOptions,
  );

  return [
    "scrypt",
    scryptOptions.N,
    scryptOptions.r,
    scryptOptions.p,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, n, r, p, salt, hash] = storedHash.split("$");

  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !hash) {
    return false;
  }

  const storedKey = Buffer.from(hash, "base64url");
  const derivedKey = await scryptAsync(
    password,
    Buffer.from(salt, "base64url"),
    storedKey.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 160 * 1024 * 1024,
    },
  );

  return (
    storedKey.length === derivedKey.length &&
    timingSafeEqual(storedKey, derivedKey)
  );
}
