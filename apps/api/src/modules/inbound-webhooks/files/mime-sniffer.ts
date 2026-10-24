/**
 * The MIME type of a file's real content, read from its magic bytes. Resolves
 * to undefined when the bytes match no known signature (plain text, CSV...).
 * `file-type` is ESM-only, hence the dynamic import.
 */
export async function sniffMime(head: Buffer): Promise<string | undefined> {
  const { fileTypeFromBuffer } = await import('file-type');
  return (await fileTypeFromBuffer(head))?.mime;
}
