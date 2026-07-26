export const CATEGORIES = ['Attack', 'Damage', 'Spell', 'Skill', 'Save', 'Utility', 'Other'] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Attack:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Damage:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Spell:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Skill:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Save:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Utility: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  Other:   'bg-gray-100 text-gray-700',
};

interface CategorySelectProps {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}

export function CategorySelect({ value, onChange, id }: CategorySelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
    </select>
  );
}
