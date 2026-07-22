/**
 * Resolves spintax like "{Hey|Hi there|Yo}, love this!" into one random variant,
 * so comment pools and DM templates don't post byte-identical text across
 * profiles/targets (a common duplicate-content detection trigger). Nested groups
 * are supported; there is no variable interpolation (e.g. no {{username}}).
 */
export function resolveSpintax(text: string): string {
  const groupPattern = /\{([^{}]+)\}/;
  let result = text;
  while (groupPattern.test(result)) {
    result = result.replace(groupPattern, (_, group: string) => {
      const options = group.split("|");
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  return result;
}
