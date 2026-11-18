/** Objects by key: stands in for S3, so the suite needs no object store. */
export class MemoryStorage {
  objects = new Map<string, Buffer>();
  puts = 0;

  assertReady() {}

  exists(key: string) {
    return Promise.resolve(this.objects.has(key));
  }

  async put(key: string, body: AsyncIterable<Buffer>, size: number) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(chunk);
    const data = Buffer.concat(chunks);
    expect(data.length).toBe(size);
    this.objects.set(key, data);
    this.puts += 1;
  }

  delete(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
