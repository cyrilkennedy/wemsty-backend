const POST_CATEGORIES = [
  { slug: 'general', name: 'General', description: 'Broad thoughts that do not fit a narrower lane.' },
  { slug: 'mindset', name: 'Mindset', description: 'Personal growth, perspective, discipline, and reflection.' },
  { slug: 'love', name: 'Love', description: 'Relationships, romance, intimacy, and emotional connection.' },
  { slug: 'tech', name: 'Tech', description: 'Technology, software, gadgets, builders, and innovation.' },
  { slug: 'life', name: 'Life', description: 'Daily life, stories, lessons, and lived experiences.' },
  { slug: 'business', name: 'Business', description: 'Money, entrepreneurship, careers, and strategy.' },
  { slug: 'culture', name: 'Culture', description: 'Society, trends, media, art, and collective behavior.' },
  { slug: 'faith', name: 'Faith', description: 'Belief, spirituality, values, and inner conviction.' },
  { slug: 'health', name: 'Health', description: 'Mental health, fitness, wellness, and personal care.' },
  { slug: 'creativity', name: 'Creativity', description: 'Writing, design, music, ideas, and creative process.' },
];

const POST_CATEGORY_SLUGS = POST_CATEGORIES.map((category) => category.slug);
const DEFAULT_POST_CATEGORY = 'general';

function normalizeCategorySlug(category) {
  if (typeof category !== 'string') {
    return null;
  }

  return category.trim().toLowerCase().replace(/\s+/g, '-');
}

function isValidPostCategory(category) {
  return POST_CATEGORY_SLUGS.includes(normalizeCategorySlug(category));
}

function getPostCategory(category) {
  const normalized = normalizeCategorySlug(category);
  return POST_CATEGORIES.find((item) => item.slug === normalized) || null;
}

module.exports = {
  POST_CATEGORIES,
  POST_CATEGORY_SLUGS,
  DEFAULT_POST_CATEGORY,
  normalizeCategorySlug,
  isValidPostCategory,
  getPostCategory,
};
