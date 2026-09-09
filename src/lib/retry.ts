export type RetryOptions = { attempts?: number; delaysMs?: number[] };

export async function retryAsync<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delays = options.delaysMs ?? [300, 900];
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1) break;
      const delay = delays[Math.min(attempt, delays.length - 1)] ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
