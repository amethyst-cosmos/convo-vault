import { inflateRawSync } from "node:zlib";
import { dirname, isAbsolute, normalize, sep } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function safeName(name) {
  const unix = name.replace(/\\/g, "/");
  if (!unix || unix.includes("\0") || unix.startsWith("/") || /^[A-Za-z]:/.test(unix)) throw new Error(`Unsafe ZIP entry: ${name}`);
  const parts = unix.split("/");
  if (parts.some((part) => part === "..")) throw new Error(`ZIP traversal rejected: ${name}`);
  return parts.filter((part) => part && part !== ".").join("/");
}

export function readZip(path, limits = {}) {
  const maxEntries = limits.maxEntries ?? 5000;
  const maxUncompressedBytes = limits.maxUncompressedBytes ?? 2 * 1024 * 1024 * 1024;
  const bytes = readFileSync(path);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === EOCD) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("ZIP end-of-central-directory not found");
  const count = bytes.readUInt16LE(eocd + 10);
  if (count > maxEntries) throw new Error(`ZIP has too many entries: ${count}`);
  let offset = bytes.readUInt32LE(eocd + 16);
  const entries = [];
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(offset) !== CENTRAL) throw new Error(`Invalid ZIP central directory at entry ${index}`);
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error("ZIP64 is not supported in Raw Pack v0.2");
    if (flags & 1) throw new Error("Encrypted ZIP entries are not supported");
    const encoding = flags & 0x800 ? "utf8" : "utf8";
    const name = safeName(bytes.subarray(offset + 46, offset + 46 + nameLength).toString(encoding));
    total += uncompressedSize;
    if (total > maxUncompressedBytes) throw new Error("ZIP uncompressed size exceeds safety limit");
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset, directory: name.endsWith("/") });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  function data(entry) {
    if (bytes.readUInt32LE(entry.localOffset) !== LOCAL) throw new Error(`Invalid ZIP local header: ${entry.name}`);
    const nameLength = bytes.readUInt16LE(entry.localOffset + 26);
    const extraLength = bytes.readUInt16LE(entry.localOffset + 28);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const compressed = bytes.subarray(start, start + entry.compressedSize);
    const output = entry.method === 0 ? Buffer.from(compressed) : entry.method === 8 ? inflateRawSync(compressed) : null;
    if (!output) throw new Error(`Unsupported ZIP compression method ${entry.method}: ${entry.name}`);
    if (output.length !== entry.uncompressedSize) throw new Error(`ZIP size mismatch: ${entry.name}`);
    return output;
  }
  return { entries, data };
}

export function extractZip(zip, destination) {
  for (const entry of zip.entries) {
    const target = normalize(`${destination}${sep}${entry.name.split("/").join(sep)}`);
    if (isAbsolute(entry.name) || !target.startsWith(normalize(`${destination}${sep}`))) throw new Error(`ZIP output escaped destination: ${entry.name}`);
    if (entry.directory) mkdirSync(target, { recursive: true });
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, zip.data(entry));
    }
  }
}
