// WCAG 2.x contrast helpers, used to keep text on artwork overlays readable (see test/contrast.test.ts).
type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function contrastRatio(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` over `bg` at `alpha` opacity. */
export const blend = (fg: RGB, bg: RGB, alpha: number): RGB => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as RGB;

/** Smallest opacity of a black scrim that lets white text reach `ratio` over the brightest possible artwork pixel. */
export function minScrimAlpha(ratio = 4.5) {
  const white: RGB = [255, 255, 255];
  for (let a = 0; a <= 1; a += 0.01) if (contrastRatio(white, blend([0, 0, 0], white, a)) >= ratio) return Math.round(a * 100) / 100;
  return 1;
}

/** Opacity of the black scrim directly behind overlay text on cards (`via-black/70` + `from-black/95` gradient). */
export const CARD_SCRIM_ALPHA = 0.7;
