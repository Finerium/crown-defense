#!/usr/bin/env node
/**
 * Mint one KONSOL_USERS entry.
 *
 *   node scripts/konsol-hash.mjs <email> <label> <password>
 *
 * Prints exactly one JSON line: { "email", "label", "salt", "hash" }. The plaintext password is never
 * printed, never logged and never written anywhere. Collect the lines for each operator into a JSON
 * array and set that array as KONSOL_USERS.
 */
import { randomBytes, scryptSync } from 'node:crypto';

const [email, label, password] = process.argv.slice(2);

if (!email || !label || !password) {
  process.stderr.write('usage: node scripts/konsol-hash.mjs <email> <label> <password>\n');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');

process.stdout.write(`${JSON.stringify({ email, label, salt, hash })}\n`);
