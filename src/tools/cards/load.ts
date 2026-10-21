// Cache-or-fetch for provider inputs. Fetched files live under .cache/ (already
// gitignored) so a rebuild is offline and reproducible, and deleting the file is
// how you refresh it. The upstreams are pinned by the providers that call this,
// not here.

const CACHE_DIR = ".cache";

export const loadJson = async <T>(
  filename: string,
  url: string,
): Promise<T> => {
  const path = `${CACHE_DIR}/${filename}`;
  const cached = Bun.file(path);

  if (await cached.exists()) return (await cached.json()) as T;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `GET ${url} failed: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  // Parse before writing, so a truncated response doesn't poison the cache.
  const parsed = JSON.parse(text) as T;
  await Bun.write(path, text);
  return parsed;
};
