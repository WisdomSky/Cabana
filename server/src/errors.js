export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorBody(err) {
  return {
    error: {
      code: err.code || 'internal_error',
      message: err.message || 'Unexpected error.',
      ...(err.details ? { details: err.details } : {}),
    },
  };
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function sanitizeText(value, max = 4000) {
  return String(value ?? '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .slice(0, max);
}
