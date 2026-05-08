function responseNormalizer(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      if (body.success === undefined && body.status) {
        body.success = body.status === 'success' || body.status === 'ok';
      }

      if (body.success === false && !body.code) {
        body.code = res.statusCode === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED';
      }

      if (body.success === false && !body.errors) {
        body.errors = [];
      }
    }

    return originalJson(body);
  };

  next();
}

module.exports = responseNormalizer;
