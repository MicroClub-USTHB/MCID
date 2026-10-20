import type { ComponentProps } from 'react';

/**
 * A table that scrolls sideways inside its own box, so a wide one never widens the page. The
 * box is focusable, so a keyboard user can scroll it too.
 */
export function DocTable(props: ComponentProps<'table'>) {
  return (
    <div className="docs-table relative my-6 overflow-auto prose-no-margin" tabIndex={0}>
      <table {...props} />
    </div>
  );
}
