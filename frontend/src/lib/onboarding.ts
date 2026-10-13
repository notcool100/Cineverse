// First-run taste picks. Picked titles become 👍 ratings (which the server's recommender already uses);
// picked genres are kept on this device and drive a "Because you like …" row until real history takes over.
const doneKey = (uid: string) => `cineora.onboarded.${uid}`;
const genresKey = (uid: string) => `cineora.genres.${uid}`;
export const MIN_PICKS = 3;

export function isOnboarded(uid: string): boolean {
  try {
    return localStorage.getItem(doneKey(uid)) === "1";
  } catch {
    return true; // can't remember it, so don't nag
  }
}
export function finishOnboarding(uid: string, genres: string[]) {
  try {
    localStorage.setItem(doneKey(uid), "1");
    localStorage.setItem(genresKey(uid), JSON.stringify(genres));
  } catch {}
}
export function favouriteGenres(uid: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(genresKey(uid)) ?? "[]");
    return Array.isArray(v) ? v.filter((g) => typeof g === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}
