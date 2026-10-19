/** Em and en dashes are not used anywhere in these docs, so the API's own wording gets plain hyphens. */
function plainDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ' - ').replace(/–/g, '-');
}

/**
 * Turns text from the API (markdown written for Swagger) into text that is safe in MDX. Code spans
 * stay as they are. Elsewhere `<`, `>`, `{` and `}` become entities, because MDX would read them as
 * JSX or an expression; a line that starts with `#` is escaped so it cannot become a heading, and
 * deep indentation is removed so it cannot become a code block.
 */
export function mdxText(text: string): string {
  return plainDashes(text)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/^[ \t]{4,}/, '').replace(/^#/, '\\#'))
    .join('\n')
    .split(/(`[^`]*`)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\{/g, '&#123;')
            .replace(/\}/g, '&#125;')
    )
    .join('');
}

/**
 * One line, for a table cell. Backslashes outside code spans are doubled first (so an author's
 * `\|` cannot cancel the escape added below; the `\#` that `mdxText` adds is kept), then each
 * character in `special` is escaped.
 */
function oneLine(text: string | undefined, special: RegExp): string {
  if (!text) return '';
  return mdxText(text)
    .replace(/\s*\n\s*/g, ' ')
    .split(/(`[^`]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/\\(?!#)/g, '\\\\')))
    .join('')
    .replace(special, '\\$&')
    .trim();
}

/** The same for one table cell: one line, and the pipe that would end the cell escaped. */
export function cellText(text: string | undefined): string {
  return oneLine(text, /\|/g);
}

/** A table cell that is also link text: the brackets that would end the link are escaped too. */
export function linkText(text: string | undefined): string {
  return oneLine(text, /[[\]|]/g);
}

/** For a value inside a JSX attribute written between double quotes. */
export function attributeText(text: string): string {
  return plainDashes(text).replace(/"/g, '&quot;');
}
