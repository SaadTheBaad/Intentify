export function makeIntentId(label: string): string {
    const cleaned = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50);
  
    return cleaned || `intent-${Date.now()}`;
  }
  