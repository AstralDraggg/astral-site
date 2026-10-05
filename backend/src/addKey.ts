/**
 * Adds a license key to the database.
 *
 *   npm run key:add -- ASTRAL-DEMO-0001 sub-30 "promo key"
 *
 * Product ids: sub-30 | sub-90 | sub-999 | hwid-reset
 */
import { initSchema, insertLicenseKey, isRemoteDb, db } from './db.js';

const [, , key, productId, note] = process.argv;

async function main() {
  if (!key || !productId) {
    console.log('Usage: npm run key:add -- <KEY> <productId> [note]');
    console.log('Example: npm run key:add -- ASTRAL-DEMO-0001 sub-30');
    process.exit(1);
  }

  const allowed = ['sub-30', 'sub-90', 'sub-999', 'hwid-reset'];
  if (!allowed.includes(productId)) {
    console.log(`Unknown product id "${productId}". Use one of: ${allowed.join(', ')}`);
    process.exit(1);
  }

  await initSchema();
  await insertLicenseKey(key, productId, note ?? '');

  console.log(`Key ${key.toUpperCase()} saved for ${productId} (${isRemoteDb() ? 'Turso' : 'local file'}).`);
  db.close();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
