import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const android = new URL('../android/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('native-webp/manifest.json', android), 'utf8'));
for (const [path, expected] of Object.entries(manifest.libraries)) {
  test(`${path}: verified binary, correct ABI, 16 KB LOAD and RELRO`, () => {
    const data = readFileSync(new URL(path, android));
    assert.equal(data.length, expected.size);
    assert.equal(createHash('sha256').update(data).digest('hex'), expected.sha256);
    assert.equal(data.subarray(0, 4).toString('hex'), '7f454c46');
    assert.equal(data[4], 2, 'ELF64'); assert.equal(data[5], 1, 'Little-endian');
    assert.equal(data.readUInt16LE(18), path.includes('/x86_64/') ? 62 : 183);
    const start = Number(data.readBigUInt64LE(32));
    const size = data.readUInt16LE(54), count = data.readUInt16LE(56);
    let loads = 0, relro = 0;
    for (let i = 0; i < count; i++) {
      const p = start + i * size, type = data.readUInt32LE(p);
      const offset = data.readBigUInt64LE(p + 8), address = data.readBigUInt64LE(p + 16);
      if (type === 1) {
        loads++;
        assert.ok(data.readBigUInt64LE(p + 48) >= 16384n, 'LOAD alignment');
        assert.equal((address - offset) % 16384n, 0n, 'LOAD file/virtual alignment');
      } else if (type === 0x6474e552) {
        relro++;
        assert.equal((address + data.readBigUInt64LE(p + 40)) % 16384n, 0n, 'RELRO end');
      }
    }
    assert.ok(loads > 0); assert.equal(relro, 1);
  });
}
