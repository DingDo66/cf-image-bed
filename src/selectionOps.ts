export async function collectImageIds(
  load: (
    offset: number,
    signal: AbortSignal,
  ) => Promise<{ images: { id: string }[]; total: number }>,
  signal: AbortSignal,
): Promise<Set<string>> {
  const ids = new Set<string>();
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    signal.throwIfAborted();
    const page = await load(offset, signal);
    signal.throwIfAborted();
    total = page.total;
    if (!page.images.length) break;
    for (const image of page.images) ids.add(image.id);
    offset += page.images.length;
  }
  return ids;
}

export async function runImageBatch(
  ids: string[],
  mutate: (id: string, signal: AbortSignal) => Promise<unknown>,
  signal: AbortSignal,
  onProgress: (completed: number) => void,
): Promise<{ succeeded: string[]; failed: string[]; firstError: string }> {
  const uniqueIds = [...new Set(ids)];
  const succeeded: string[] = [];
  const failed: string[] = [];
  let firstError = "";
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < uniqueIds.length && !signal.aborted) {
      const id = uniqueIds[cursor++];
      try {
        await mutate(id, signal);
        succeeded.push(id);
      } catch (error) {
        failed.push(id);
        firstError ||= error instanceof Error ? error.message : String(error);
      }
      onProgress(++completed);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, uniqueIds.length) }, worker),
  );
  signal.throwIfAborted();
  return { succeeded, failed, firstError };
}
