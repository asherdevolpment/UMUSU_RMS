import { Routes } from '@angular/router';
import { adminGuard, authGuard, budgetGuard, requesterGuard, settledAuthGuard } from './guards/auth.guard';
import { AdminDashboard } from './pages/admin-dashboard/admin-dashboard';
import { ApproverDashboard } from './pages/approver-dashboard/approver-dashboard';
import { AssetDashboard } from './pages/asset-dashboard/asset-dashboard';
import { BudgetDashboard } from './pages/budget-dashboard/budget-dashboard';
import { ChangePassword } from './pages/change-password/change-password';
import { Login } from './pages/login/login';
import { RequesterDashboard } from './pages/requester-dashboard/requester-dashboard';

export const routes: Routes = [
  {
    path: 'login',
    component: Login
  },
  {
    path: 'admin',
    component: AdminDashboard,
    canActivate: [adminGuard]
  },
  {
    path: 'change-password',
    component: ChangePassword,
    canActivate: [authGuard]
  },
  {
    path: 'requester',
    component: RequesterDashboard,
    canActivate: [requesterGuard]
  },
  {
    path: 'approver',
    component: ApproverDashboard,
    canActivate: [settledAuthGuard]
  },
  {
    path: 'assets',
    component: AssetDashboard,
    canActivate: [settledAuthGuard]
  },
  {
    path: 'budget',
    component: BudgetDashboard,
    canActivate: [budgetGuard]
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];
