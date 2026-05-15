const SEP = '\\';

export const pathUtils = {
  join(...parts: string[]): string {
    return parts
      .filter(Boolean)
      .join(SEP)
      .replace(/[/\\]+/g, SEP);
  },

  dirname(p: string): string {
    const normalized = p.replace(/[/\\]+/g, SEP);
    const idx = normalized.lastIndexOf(SEP);
    return idx > 0 ? normalized.substring(0, idx) : normalized;
  },

  basename(p: string): string {
    const normalized = p.replace(/[/\\]+/g, SEP);
    return normalized.substring(normalized.lastIndexOf(SEP) + 1);
  },

  extname(p: string): string {
    const base = pathUtils.basename(p);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.substring(dot) : '';
  },

  stem(p: string): string {
    const base = pathUtils.basename(p);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.substring(0, dot) : base;
  },

  isMarkdown(p: string): boolean {
    const ext = pathUtils.extname(p).toLowerCase();
    return ext === '.md' || ext === '.markdown';
  },

  relative(from: string, to: string): string {
    const fromNorm = from.replace(/[/\\]+/g, SEP).replace(/\\$/, '');
    const toNorm = to.replace(/[/\\]+/g, SEP);
    if (toNorm.startsWith(fromNorm + SEP)) {
      return toNorm.substring(fromNorm.length + 1);
    }
    return toNorm;
  },

  vaultName(vaultPath: string): string {
    return pathUtils.basename(vaultPath) || vaultPath;
  },
};
