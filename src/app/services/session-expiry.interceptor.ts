import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const isAuthRequest = request.url.includes('/api/auth/');

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 401 &&
        authService.isLoggedIn() &&
        !isAuthRequest
      ) {
        authService.logout();
        void router.navigate(['/login'], {
          queryParams: { expired: '1' }
        });
      }

      return throwError(() => error);
    })
  );
};
