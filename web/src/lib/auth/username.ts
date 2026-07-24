export function normalizeUsername(username: string): string {
  return username.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}
