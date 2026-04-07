const FRUIT_BASES = [
  'apple', 'apricot', 'avocado', 'banana', 'blackberry', 'blueberry', 'cantaloupe', 'cherry',
  'coconut', 'cranberry', 'dragonfruit', 'fig', 'grape', 'grapefruit', 'guava', 'kiwi',
  'lemon', 'lime', 'lychee', 'mango', 'nectarine', 'orange', 'papaya', 'peach',
  'pear', 'pineapple', 'plum', 'pomegranate', 'raspberry', 'starfruit', 'strawberry', 'watermelon'
] as const;

const SPICE_BASES = [
  'allspice', 'anise', 'asafoetida', 'basil', 'bayleaf', 'cardamom', 'caraway', 'cayenne',
  'chili', 'chive', 'cilantro', 'cinnamon', 'clove', 'coriander', 'cumin', 'curry',
  'dill', 'fennel', 'fenugreek', 'galangal', 'garlic', 'ginger', 'juniper', 'lavender',
  'lemongrass', 'marjoram', 'mint', 'nutmeg', 'oregano', 'paprika', 'pepper', 'rosemary'
] as const;

const VARIANT_SUFFIXES = ['sun', 'moon', 'wind', 'mist'] as const;

const expandTo128 = (bases: readonly string[]): string[] =>
  bases.flatMap((base) => VARIANT_SUFFIXES.map((suffix) => `${base}-${suffix}`));

export const FRUIT_NAMES = expandTo128(FRUIT_BASES);
export const SPICE_NAMES = expandTo128(SPICE_BASES);

const normalise = (value: string) => value.trim().toLowerCase();

export const pickRandomNickname = (taken: Iterable<string> = []): string => {
  const takenSet = new Set<string>();
  for (const name of taken) {
    if (typeof name === 'string') {
      takenSet.add(normalise(name));
    }
  }

  const allCombos: string[] = [];
  for (const fruit of FRUIT_NAMES) {
    for (const spice of SPICE_NAMES) {
      const combo = `${fruit}-${spice}`;
      if (!takenSet.has(normalise(combo))) {
        allCombos.push(combo);
      }
    }
  }

  const pool = allCombos.length > 0 ? allCombos : [`${FRUIT_NAMES[0]}-${SPICE_NAMES[0]}`];
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? `${FRUIT_NAMES[0]}-${SPICE_NAMES[0]}`;
};
