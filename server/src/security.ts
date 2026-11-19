import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;
const COST = 16384;

function scrypt(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LEN, { N: cost }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Formato guardado: scrypt$N$salt(hex)$hash(hex) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, COST);
  return `scrypt$${COST}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !cost || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), Number(cost));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
