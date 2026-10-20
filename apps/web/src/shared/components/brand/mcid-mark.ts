/**
 * The MCID mark: a fingerprint in the mcoli-ui logo style (120×120 grid, 12-unit strokes,
 * round caps, ridges 22 units apart). The outer ridge and the core use the foreground colour,
 * the middle ridge the primary colour, the same split as the mcoli-ui mark.
 * Shared by the React components, the app icons and the Open Graph image.
 */
export const MCID_MARK = {
  viewBox: '0 0 120 120',
  strokeWidth: 12,
  /** Outer ridge: an arch whose feet turn in at the bottom, like a fingertip. */
  outer: 'M 38 100 A 22 22 0 0 1 16 78 V 60 A 44 44 0 0 1 104 60 V 78 A 22 22 0 0 1 82 100',
  /** Middle ridge, drawn in the primary colour. */
  middle: 'M 38 82 V 60 A 22 22 0 0 1 82 60 V 82',
  /** The core of the print. */
  core: 'M 60 56 V 100',
} as const;

/** The Primary theme in dark mode: the colours of the brand tile and generated images. */
export const BRAND_COLORS = {
  background: '#0a0a0a',
  card: '#171717',
  border: '#262626',
  foreground: '#fafafa',
  muted: '#a1a1a1',
  primary: '#d9ddff',
  chart: '#2563ef',
} as const;
