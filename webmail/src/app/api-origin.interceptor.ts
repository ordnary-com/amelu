import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_ORIGIN } from './config';

// Pages call /api/... as if same-origin. In development that's true (ng serve
// proxies it); in production the API is on its own host, so prefix it and send
// the session cookie along. A 401 anywhere means the session is gone: back to
// the sign-in page, and return here afterwards.
export const apiOriginInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const request = req.url.startsWith('/api/')
    ? req.clone({ url: API_ORIGIN + req.url, withCredentials: true })
    : req;
  return next(request).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.endsWith('/api/webmail/login') &&
        !router.url.startsWith('/login')
      ) {
        void router.navigate(['/login'], { queryParams: { returnTo: router.url } });
      }
      return throwError(() => err);
    }),
  );
};
