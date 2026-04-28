import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn() && authService.currentUser()?.mustChangePassword) {
    return router.createUrlTree(['/change-password']);
  }

  if (authService.isLoggedIn() && authService.isAdmin()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

export const settledAuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.currentUser()?.mustChangePassword) {
    return router.createUrlTree(['/change-password']);
  }

  return true;
};

export const requesterGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn() && authService.currentUser()?.mustChangePassword) {
    return router.createUrlTree(['/change-password']);
  }

  if (authService.isLoggedIn() && authService.currentUser()?.role.name === 'Requester') {
    return true;
  }

  if (authService.isLoggedIn()) {
    return router.createUrlTree([authService.defaultRoute()]);
  }

  return router.createUrlTree(['/login']);
};

export const budgetGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn() && authService.currentUser()?.mustChangePassword) {
    return router.createUrlTree(['/change-password']);
  }

  const roleName = authService.currentUser()?.role.name;

  if (authService.isLoggedIn() && ['Admin', 'Budget Officer', 'Finance Officer'].includes(roleName ?? '')) {
    return true;
  }

  if (authService.isLoggedIn()) {
    return router.createUrlTree([authService.defaultRoute()]);
  }

  return router.createUrlTree(['/login']);
};
