export function failureText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `vane: could not open the pane: ${message}`;
}
