function sanitizeExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    // Remove query/hash so signed parameters or tokens are not exposed in payloads.
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (error) {
    // Not a valid absolute URL; return as-is.
    return rawUrl;
  }
}

module.exports = {
  sanitizeExternalUrl
};
