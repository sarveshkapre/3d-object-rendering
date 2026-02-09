export const CMS_LIMITS = {
  titleMax: 120,
  hookMax: 260,
  keywordMax: 40,
  keywordsMaxCount: 16,
  storyTitleMax: 140,
  storySummaryMax: 520,
  storyParagraphMax: 1400,
  storyParagraphsMax: 30,
  storyReferencesMax: 16,
  referenceLabelMax: 160,
  referenceUrlMax: 2048,
  hotspotsMax: 60,
  hotspotLabelMax: 80,
  hotspotTitleMax: 140,
  hotspotBodyMax: 900,
  reasonMax: 320,
  releaseYearMin: 0,
  releaseYearMax: 9999,
  featuredRankMin: 0,
  featuredRankMax: 100000
};

export const ALLOWED_REFERENCE_PROTOCOLS = new Set(["http:", "https:"]);

export function clampText(value, max) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!max || trimmed.length <= max) {
    return trimmed;
  }
  return trimmed.slice(0, max).trimEnd();
}

export function sanitizeReferenceUrl(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_REFERENCE_PROTOCOLS.has(parsed.protocol)) {
      return "";
    }
    const href = parsed.toString();
    return clampText(href, CMS_LIMITS.referenceUrlMax);
  } catch {
    return "";
  }
}

export function sanitizeModerationReason(value) {
  return clampText(value, CMS_LIMITS.reasonMax);
}

export function sanitizeOverridePayload(override) {
  if (!override || typeof override !== "object") {
    return {};
  }

  const next = { ...override };

  if (Object.prototype.hasOwnProperty.call(next, "title")) {
    next.title = clampText(next.title, CMS_LIMITS.titleMax);
  }

  if (Object.prototype.hasOwnProperty.call(next, "hook")) {
    next.hook = clampText(next.hook, CMS_LIMITS.hookMax);
  }

  if (Array.isArray(next.keywords)) {
    next.keywords = next.keywords
      .filter((entry) => typeof entry === "string")
      .map((entry) => clampText(entry, CMS_LIMITS.keywordMax))
      .filter(Boolean)
      .slice(0, CMS_LIMITS.keywordsMaxCount);
  }

  if (next.story && typeof next.story === "object") {
    const story = next.story;
    const body = Array.isArray(story.body)
      ? story.body
          .filter((entry) => typeof entry === "string")
          .map((entry) => clampText(entry, CMS_LIMITS.storyParagraphMax))
          .filter(Boolean)
          .slice(0, CMS_LIMITS.storyParagraphsMax)
      : [];

    const references = Array.isArray(story.references)
      ? story.references
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => ({
            label: clampText(entry.label, CMS_LIMITS.referenceLabelMax),
            url: sanitizeReferenceUrl(entry.url)
          }))
          .filter((entry) => entry.label && entry.url)
          .slice(0, CMS_LIMITS.storyReferencesMax)
      : [];

    next.story = {
      title: clampText(story.title, CMS_LIMITS.storyTitleMax),
      summary: clampText(story.summary, CMS_LIMITS.storySummaryMax),
      body,
      references
    };
  }

  if (Array.isArray(next.hotspots)) {
    next.hotspots = next.hotspots
      .filter((entry) => entry && typeof entry === "object" && typeof entry.id === "string")
      .map((entry) => ({
        id: entry.id,
        label: clampText(entry.label, CMS_LIMITS.hotspotLabelMax),
        title: clampText(entry.title, CMS_LIMITS.hotspotTitleMax),
        body: clampText(entry.body, CMS_LIMITS.hotspotBodyMax),
        reference: sanitizeReferenceUrl(entry.reference)
      }))
      .map((entry) => ({
        ...entry,
        reference: entry.reference || undefined
      }))
      .slice(0, CMS_LIMITS.hotspotsMax);
  }

  if (Object.prototype.hasOwnProperty.call(next, "releaseYear")) {
    if (Number.isFinite(next.releaseYear)) {
      const clamped = Math.max(CMS_LIMITS.releaseYearMin, Math.min(CMS_LIMITS.releaseYearMax, next.releaseYear));
      next.releaseYear = clamped;
    } else {
      next.releaseYear = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(next, "featuredRank")) {
    if (Number.isFinite(next.featuredRank)) {
      const clamped = Math.max(CMS_LIMITS.featuredRankMin, Math.min(CMS_LIMITS.featuredRankMax, next.featuredRank));
      next.featuredRank = clamped;
    } else {
      next.featuredRank = null;
    }
  }

  return next;
}

