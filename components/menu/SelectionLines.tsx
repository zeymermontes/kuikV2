import { selectionGroups } from '@/lib/menu-options';

/**
 * A line's choices, one group per line, the chosen value in bold so a
 * barista reading fast sees "Avena" before "Tipo de leche". Multi-choice
 * groups fold to one line: "Extras: Queso, Tocino". The note, when given,
 * closes the list.
 */
export function SelectionLines({
  selections,
  note,
  className = '',
  prefix = '',
  strong = 'font-semibold',
}: {
  selections: readonly { group?: string | null; name?: string | null }[] | null | undefined;
  note?: string | null;
  className?: string;
  /** Printed before each line, e.g. "+ " on the kitchen screen. */
  prefix?: string;
  /** Class for the chosen value. */
  strong?: string;
}) {
  const groups = selectionGroups(selections);
  if (groups.length === 0 && !note) return null;
  return (
    <span className={`block leading-snug ${className}`}>
      {groups.map((g, i) => (
        <span key={i} className="block">
          {prefix}
          {g.group ? `${g.group}: ` : ''}
          <span className={strong}>{g.names.join(', ')}</span>
        </span>
      ))}
      {note && (
        <span className="block">
          {prefix}
          {note}
        </span>
      )}
    </span>
  );
}
