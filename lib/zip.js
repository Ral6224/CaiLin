'use strict';

const zlib = require('node:zlib');

const MAX_ENTRIES = 256;
const MAX_ENTRY_SIZE = 24 * 1024 * 1024;
const MAX_TOTAL_SIZE = 32 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

function createZip(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('ZIP 内容为空。');
  }

  const now = new Date();
  const stamp = dosDateTime(now);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || !entry.name) {
      throw new Error('ZIP 文件名不正确。');
    }
    const name = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    if (raw.length > MAX_ENTRY_SIZE) throw new Error('ZIP 中的文件过大。');

    const crc = crc32(raw);
    let method = 8;
    let body = zlib.deflateRawSync(raw, { level: 9 });
    if (body.length >= raw.length) {
      method = 0;
      body = raw;
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, end]);
}

function validateName(name) {
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || name.includes(':')) {
    throw new Error('ZIP 中包含不安全的文件路径。');
  }
  if (name.endsWith('/')) return false;
  const parts = name.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('ZIP 中包含不安全的文件路径。');
  }
  return true;
}

function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new Error('ZIP 文件不完整。');
  }

  let eocd = -1;
  const min = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(i + 20);
    if (i + 22 + commentLength === buffer.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP 目录不完整。');

  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);

  if (disk !== 0 || centralDisk !== 0) throw new Error('暂不支持分卷 ZIP。');
  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('暂不支持 ZIP64 文件。');
  }
  if (count > MAX_ENTRIES) throw new Error('ZIP 中的文件数量过多。');
  if (centralOffset + centralSize > eocd) throw new Error('ZIP 目录位置不正确。');

  const entries = new Map();
  const names = new Set();
  let pointer = centralOffset;
  let totalSize = 0;

  for (let index = 0; index < count; index += 1) {
    if (pointer + 46 > eocd || buffer.readUInt32LE(pointer) !== 0x02014b50) {
      throw new Error('ZIP 目录条目损坏。');
    }

    const flags = buffer.readUInt16LE(pointer + 8);
    const method = buffer.readUInt16LE(pointer + 10);
    const crc = buffer.readUInt32LE(pointer + 16);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const uncompressedSize = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const next = pointer + 46 + nameLength + extraLength + commentLength;

    if (next > eocd) throw new Error('ZIP 目录条目损坏。');
    if (flags & 0x0001) throw new Error('ZIP 已加密，暂不支持。');
    if (method !== 0 && method !== 8) throw new Error('ZIP 使用了不支持的压缩方式。');
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('暂不支持 ZIP64 文件。');
    }
    if (uncompressedSize > MAX_ENTRY_SIZE) throw new Error('ZIP 中的文件过大。');
    if (compressedSize > MAX_ENTRY_SIZE) throw new Error('ZIP 中的文件过大。');
    totalSize += uncompressedSize;
    if (totalSize > MAX_TOTAL_SIZE) throw new Error('ZIP 解压后内容过大。');

    const name = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString('utf8');
    if (!validateName(name)) {
      pointer = next;
      continue;
    }
    if (names.has(name)) throw new Error('ZIP 中存在重复文件。');
    names.add(name);

    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('ZIP 文件头损坏。');
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > centralOffset) throw new Error('ZIP 文件数据损坏。');

    const body = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let raw;
    if (method === 0) {
      raw = body;
    } else {
      try {
        raw = zlib.inflateRawSync(body, { maxOutputLength: Math.max(1, uncompressedSize) });
      } catch {
        throw new Error('ZIP 解压失败。');
      }
    }
    if (raw.length !== uncompressedSize) throw new Error('ZIP 文件大小不一致。');
    if (crc32(raw) !== crc) throw new Error('ZIP 文件校验失败。');

    entries.set(name, raw);
    pointer = next;
  }

  return entries;
}

module.exports = { createZip, readZip, crc32 };
