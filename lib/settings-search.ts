// Finds settings on a dashboard form by the text people see: row labels,
// card headings and select options. Pure DOM work, shared by the Design
// form's own search box and the admin-wide search (which lands on a page with
// ?q=<label> and asks this to scroll there).

export interface SettingHit {
  /** The row (or whole card) to scroll to and outline. */
  el: HTMLElement;
  label: string;
  /** Heading of the card the row sits in; null when the hit is the card itself. */
  section: string | null;
  /** The select option that matched, when the label itself did not. */
  option: string | null;
}

export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Every labelled row, card heading or select option under `root` matching `query`. */
export function findSettings(root: HTMLElement, query: string): SettingHit[] {
  const nq = norm(query.trim());
  if (nq.length < 2) return [];
  const out: SettingHit[] = [];
  const sectionOf = (el: HTMLElement): string | null => {
    let card: HTMLElement = el;
    while (card.parentElement && card.parentElement !== root) card = card.parentElement;
    const h = card.querySelector('h2');
    return h && h !== el ? (h.textContent ?? '').trim() : null;
  };
  root.querySelectorAll<HTMLElement>('[data-setting], label, h2').forEach((el) => {
    // A toggle's <label> is the row; a field's <label> sits above its input,
    // so the row is its parent; a heading stands for its whole card.
    const target = el.matches('[data-setting]')
      ? el
      : el.tagName === 'H2' || !el.querySelector('input')
        ? el.parentElement
        : el;
    if (!target || out.some((h) => h.el === target)) return;
    const label = (el.dataset.setting ?? (el.tagName === 'H2' ? el.textContent : el.querySelector('span')?.textContent ?? el.textContent) ?? '').trim();
    let option: string | null = null;
    if (!norm(label).includes(nq)) {
      const opt = Array.from(target.querySelectorAll('option')).find((o) => norm(o.textContent ?? '').includes(nq));
      if (!opt) return;
      option = (opt.textContent ?? '').trim();
    }
    out.push({ el: target, label, section: el.tagName === 'H2' ? null : sectionOf(target), option });
  });
  return out;
}


/** Outline `hit` (clearing any other) and bring it into view. */
export function revealSetting(root: HTMLElement, hit: SettingHit): void {
  root.querySelectorAll('.setting-hit').forEach((el) => el.classList.remove('setting-hit'));
  hit.el.classList.add('setting-hit');
  hit.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
