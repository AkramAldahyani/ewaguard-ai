const ROLES = new Set(['EMPLOYEE', 'IT_SECURITY_ADMIN']);

function authenticated(req, res) {
  if (req.auth?.userId && req.auth.userId === req.user?.id) return true;
  res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' } });
  return false;
}

export function requireRole(...roles) {
  if (!roles.length || roles.some((role) => !ROLES.has(role))) throw new Error('Invalid authorization policy.');
  return (req, res, next) => {
    if (!authenticated(req, res)) return;
    if (roles.includes(req.user.role)) return next();
    console.warn(JSON.stringify({ level: 'SECURITY', event: 'authorization_denied', userId: req.user.id }));
    return res
      .status(403)
      .json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to access this area.' } });
  };
}

// The loader must fetch the resource from trusted storage, never from request body ownership fields.
// Missing and inaccessible resources deliberately return the same response.
export function requireOwnershipOrRole(loadResource, { ownerId = (resource) => resource.userId, roles = [] } = {}) {
  if (roles.some((role) => !ROLES.has(role))) throw new Error('Invalid authorization policy.');
  return async (req, res, next) => {
    if (!authenticated(req, res)) return;
    try {
      const resource = await loadResource(req);
      if (!resource || (!roles.includes(req.user.role) && ownerId(resource) !== req.user.id)) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
      }
      req.authorizedResource = resource;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
