/**
 * The MIME type of a file's real content, read from its magic bytes. Resolves
 * to undefined when the bytes match no known signature (plain text, CSV...).
 * It reads the file itself, not just its start: an Office document whose zip
 * entries are laid out late looks like a plain zip from the first few KB.
 * `file-type` is ESM-only, hence the dynamic import.
 */
export async function sniffMime(path: string): Promise<string | undefined> {
  const { fileTypeFromFile } = await import('file-type');
  return (await fileTypeFromFile(path))?.mime;
}
