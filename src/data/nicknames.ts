const NICKNAME_SETS = [
  { prefix: 'golang', count: 3 },
  { prefix: 'typescript', count: 2 },
  { prefix: 'vim', count: 3 },
  { prefix: 'clang', count: 2 }
] as const;

export const AVAILABLE_NICKNAMES = NICKNAME_SETS.flatMap((set) =>
  Array.from({ length: set.count }, (_, index) => `${set.prefix}-${index + 1}`)
);

const normalise = (value: string) => value.trim().toLowerCase();

export const pickRandomNickname = (taken: Iterable<string> = []): string => {
  const takenSet = new Set<string>();
  for (const name of taken) {
    if (typeof name === 'string') {
      takenSet.add(normalise(name));
    }
  }

  const available = AVAILABLE_NICKNAMES.filter((candidate) => !takenSet.has(normalise(candidate)));
  const pool = available.length > 0 ? available : AVAILABLE_NICKNAMES;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? 'golang-1';
};
