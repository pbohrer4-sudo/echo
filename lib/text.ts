// Strips lightweight Markdown so Sarah Eve doesn't read "asterisk asterisk"
// out loud and the UI doesn't render literal **. Defensive — Claude is
// already prompted to avoid markdown. We don't try to handle edge cases
// like nested formatting; just the common offenders.
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/(?<!\w)_(.*?)_(?!\w)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^[\s]*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
