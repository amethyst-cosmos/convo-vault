const fs = require("fs");
const zlib = require("zlib");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

async function createZipArchiveFile(entries, outputPath) {
  if (entries.length > 0xffff) {
    throw new Error(`ZIP contains too many entries for the portable archive writer: ${entries.length}.`);
  }

  const centralParts = [];
  const temporaryPaths = new Set();
  let offset = 0;
  const output = await fs.promises.open(outputPath, "wx");

  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const name = normalizeZipEntryName(entry.name);
      const nameBytes = Buffer.from(name, "utf8");
      const prepared = await prepareZipFileEntry(entry.path, name, outputPath, index);

      if (prepared.temporaryPath) {
        temporaryPaths.add(prepared.temporaryPath);
      }

      assertClassicZipRange(prepared.uncompressedSize, "ZIP entry uncompressed size");
      assertClassicZipRange(prepared.compressedSize, "ZIP entry compressed size");
      assertClassicZipRange(offset, "ZIP local header offset");
      const { dosTime, dosDate } = getDosDateTime(prepared.modifiedAt);
      const localHeader = Buffer.alloc(30 + nameBytes.length);

      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0x0800, 6);
      localHeader.writeUInt16LE(prepared.compressionMethod, 8);
      localHeader.writeUInt16LE(dosTime, 10);
      localHeader.writeUInt16LE(dosDate, 12);
      localHeader.writeUInt32LE(prepared.checksum, 14);
      localHeader.writeUInt32LE(prepared.compressedSize, 18);
      localHeader.writeUInt32LE(prepared.uncompressedSize, 22);
      localHeader.writeUInt16LE(nameBytes.length, 26);
      localHeader.writeUInt16LE(0, 28);
      nameBytes.copy(localHeader, 30);

      const centralHeader = Buffer.alloc(46 + nameBytes.length);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0x0800, 8);
      centralHeader.writeUInt16LE(prepared.compressionMethod, 10);
      centralHeader.writeUInt16LE(dosTime, 12);
      centralHeader.writeUInt16LE(dosDate, 14);
      centralHeader.writeUInt32LE(prepared.checksum, 16);
      centralHeader.writeUInt32LE(prepared.compressedSize, 20);
      centralHeader.writeUInt32LE(prepared.uncompressedSize, 24);
      centralHeader.writeUInt16LE(nameBytes.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);
      nameBytes.copy(centralHeader, 46);

      await output.write(localHeader);
      await appendFileToHandle(output, prepared.dataPath);
      centralParts.push(centralHeader);
      offset += localHeader.length + prepared.compressedSize;

      if (prepared.temporaryPath) {
        fs.rmSync(prepared.temporaryPath, { force: true });
        temporaryPaths.delete(prepared.temporaryPath);
      }
    }

    const centralDirectory = Buffer.concat(centralParts);
    assertClassicZipRange(offset, "ZIP central directory offset");
    assertClassicZipRange(centralDirectory.length, "ZIP central directory size");
    const endRecord = Buffer.alloc(22);

    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(entries.length, 8);
    endRecord.writeUInt16LE(entries.length, 10);
    endRecord.writeUInt32LE(centralDirectory.length, 12);
    endRecord.writeUInt32LE(offset, 16);
    endRecord.writeUInt16LE(0, 20);

    await output.write(centralDirectory);
    await output.write(endRecord);
  } catch (error) {
    await output.close().catch(() => {});
    fs.rmSync(outputPath, { force: true });
    throw error;
  } finally {
    for (const temporaryPath of temporaryPaths) {
      fs.rmSync(temporaryPath, { force: true });
    }
  }

  await output.close();
  return fs.statSync(outputPath).size;
}

async function prepareZipFileEntry(filePath, name, outputPath, index) {
  const stats = fs.statSync(filePath);

  if (!stats.isFile()) {
    throw new Error(`ZIP source is not a file: ${filePath}`);
  }

  if (shouldDeflateZipEntry(name, stats.size)) {
    const temporaryPath = `${outputPath}.${index}.deflate`;
    let crc = 0xffffffff;
    let uncompressedSize = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        crc = updateCrc32(crc, chunk);
        uncompressedSize += chunk.length;
        callback(null, chunk);
      }
    });
    await pipeline(
      fs.createReadStream(filePath),
      meter,
      zlib.createDeflateRaw({ level: 6 }),
      fs.createWriteStream(temporaryPath, { flags: "wx" })
    );
    const compressedSize = fs.statSync(temporaryPath).size;

    if (compressedSize < uncompressedSize) {
      return {
        checksum: (crc ^ 0xffffffff) >>> 0,
        compressedSize,
        uncompressedSize,
        compressionMethod: 8,
        dataPath: temporaryPath,
        temporaryPath,
        modifiedAt: stats.mtime
      };
    }

    fs.rmSync(temporaryPath, { force: true });
  }

  const inspected = await inspectZipFile(filePath);
  return {
    ...inspected,
    compressedSize: inspected.uncompressedSize,
    compressionMethod: 0,
    dataPath: filePath,
    temporaryPath: "",
    modifiedAt: stats.mtime
  };
}

async function inspectZipFile(filePath) {
  let crc = 0xffffffff;
  let uncompressedSize = 0;

  for await (const chunk of fs.createReadStream(filePath)) {
    crc = updateCrc32(crc, chunk);
    uncompressedSize += chunk.length;
  }

  return {
    checksum: (crc ^ 0xffffffff) >>> 0,
    uncompressedSize
  };
}

async function appendFileToHandle(output, filePath) {
  for await (const chunk of fs.createReadStream(filePath)) {
    await output.write(chunk);
  }
}

function shouldDeflateZipEntry(name, size) {
  return size >= 256 && /\.(?:json|jsonl|md|txt|csv|tsv|html|xml|svg)$/i.test(String(name || ""));
}

function assertClassicZipRange(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${label} exceeds the 4 GiB portable ZIP limit. ZIP64 support is required for this archive.`);
  }
}

function normalizeZipEntryName(name) {
  return String(name || "file")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.\.(?:\/|$)/g, "")
    || "file";
}

function getDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    dosTime: (hours << 11) | (minutes << 5) | seconds,
    dosDate: ((year - 1980) << 9) | (month << 5) | day
  };
}

function updateCrc32(crc, buffer) {
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return crc;
}

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const CRC32_TABLE = createCrc32Table();

module.exports = {
  createZipArchiveFile
};
