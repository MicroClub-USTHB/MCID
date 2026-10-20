import type * as PageTree from 'fumadocs-core/page-tree';

/** A page of the tree with the folder it sits in, in sidebar order. */
export interface TreePage {
  url: string;
  name: string;
  description?: string;
  /** The nested folder the page is in below its section, if any: `Admin API`. */
  group?: string;
}

/** A top-level folder of the docs, with every page below it, nested folders flattened. */
export interface TreeSection {
  name: string;
  description?: string;
  url?: string;
  pages: TreePage[];
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

function pagesOf(folder: PageTree.Folder, group?: string): TreePage[] {
  const own: TreePage[] = folder.index
    ? [{ url: folder.index.url, name: text(folder.index.name) ?? '', group }]
    : [];
  return [
    ...own,
    ...folder.children.flatMap((node): TreePage[] => {
      if (node.type === 'page')
        return [
          {
            url: node.url,
            name: text(node.name) ?? '',
            description: text(node.description),
            group,
          },
        ];
      if (node.type === 'folder') return pagesOf(node, text(node.name));
      return [];
    }),
  ];
}

/** The pages of a section in runs that share a group, for a list per nested folder. */
export function groupRuns(pages: TreePage[]): { group?: string; pages: TreePage[] }[] {
  const runs: { group?: string; pages: TreePage[] }[] = [];
  for (const page of pages) {
    const last = runs.at(-1);
    if (last && last.group === page.group) last.pages.push(page);
    else runs.push({ group: page.group, pages: [page] });
  }
  return runs;
}

/** The sections of the docs home: one per top-level folder of the tree. */
export function treeSections(tree: PageTree.Root): TreeSection[] {
  return tree.children.flatMap((node) =>
    node.type === 'folder'
      ? [
          {
            name: text(node.name) ?? '',
            description: text(node.description),
            url: node.index?.url,
            pages: pagesOf(node),
          },
        ]
      : []
  );
}

/**
 * The name of the folder a page sits in, or null for a page at the root (a top-level folder's
 * index page included). It goes in the page
 * title, because two pages can share a name (Members is in both APIs).
 */
export function sectionOf(tree: PageTree.Root | PageTree.Folder, url: string): string | null {
  for (const node of tree.children) {
    if (node.type !== 'folder') continue;
    const inside = sectionOf(node, url);
    if (inside) return inside;
    // A folder's index page is the folder itself, so it belongs to the folder around it.
    if (node.children.some((child) => child.type === 'page' && child.url === url))
      return text(node.name) ?? null;
  }
  return null;
}
