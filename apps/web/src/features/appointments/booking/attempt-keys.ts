export interface AttemptKeys {
  keyFor(request: string): string;
  reset(): void;
}

// The server replays a stored response for a reused key and refuses one sent with another body,
// so a key is reused only to retry the exact same request and renewed for anything else.
export function createAttemptKeys(generate: () => string): AttemptKeys {
  let current: { readonly request: string; readonly key: string } | undefined;
  return {
    keyFor(request) {
      if (current?.request !== request) current = { request, key: generate() };
      return current.key;
    },
    reset() {
      current = undefined;
    },
  };
}
