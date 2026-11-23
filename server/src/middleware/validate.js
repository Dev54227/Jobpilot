import { AppError } from '../utils/AppError.js';

// validate({ body: schema, query: schema, params: schema })
// Puts the parsed (cleaned + defaulted) values on req.valid.{params,query,body};
// controllers read from req.valid, never from raw req.body.
export const validate = (schemas) => (req, _res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(new AppError('Validation failed', 422, details));
    }
    // stored separately because req.query is read-only in Express 5
    req.valid = { ...req.valid, [part]: result.data };
  }
  next();
};
