/**
 * Minimal .docx text extraction.
 *
 * A .docx is a zip holding `word/document.xml`. Rather than pull in a zip
 * library we read the archive directly and inflate with the platform's
 * DecompressionStream, which keeps the extension dependency-free.
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const DOCUMENT_PATH = 'word/document.xml';

/** Locate the end-of-central-directory record, which sits at the tail of the file. */
function findEndOfCentralDirectory(view) {
  const earliest = Math.max(0, view.byteLength - 65557); // 64KB max comment + 22 byte record
  for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === SIG_EOCD) return offset;
  }
  return -1;
}

function readName(bytes, offset, length) {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

/** Find one file's compressed bytes and compression method inside the archive. */
function locateEntry(buffer, wantedName) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new Error('Not a valid .docx file.');

  const entryCount = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(pointer, true) !== SIG_CENTRAL) break;

    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = readName(bytes, pointer + 46, nameLength);

    if (name === wantedName) {
      // Local headers repeat the name/extra lengths, and they can differ from
      // the central directory's, so re-read them here.
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      return { method, data: bytes.subarray(dataStart, dataStart + compressedSize) };
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`${wantedName} is missing — the file may not be a Word document.`);
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Convert WordprocessingML to plain text, keeping paragraph and tab breaks. */
export function documentXmlToText(xml) {
  return xml
    .replace(/<w:tab\b[^>]*\/?>/g, '   ')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITIES[name])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** @param {ArrayBuffer} buffer @returns {Promise<string>} */
export async function extractDocxText(buffer) {
  const entry = locateEntry(buffer, DOCUMENT_PATH);
  const xml = entry.method === 0 ? new TextDecoder().decode(entry.data) : await inflateRaw(entry.data);
  return documentXmlToText(xml);
}
