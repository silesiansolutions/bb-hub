const listeners = new Set<() => void>();
const memory = new Map<string, string>();

export const subscribeStore = (callback: () => void) => {
  listeners.add(callback);
  window.addEventListener('storage', callback);

  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
};

export const readStore = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
};

export const writeStore = (key: string, value: string) => {
  memory.set(key, value);

  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }

  listeners.forEach((listener) => listener());
};
