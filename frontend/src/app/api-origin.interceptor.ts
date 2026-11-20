import { HttpInterceptorFn } from '@angular/common/http';
import { API_ORIGIN } from './config';

// Pages call /api/... as if same-origin. In development that's true (ng serve
// proxies it); in production the API is on its own host, so prefix it and send
// the session cookie along.
export const apiOriginInterceptor: HttpInterceptorFn = (req, next) =>
  req.url.startsWith('/api/') ? next(req.clone({ url: API_ORIGIN + req.url, withCredentials: true })) : next(req);
