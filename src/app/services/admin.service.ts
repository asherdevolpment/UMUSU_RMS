import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { AuthService, Campus, CurrentUser, Role } from './auth.service';

export interface CreateUserRequest {
  fullName: string;
  email: string;
  password: string;
  roleId: number;
  campusId: number;
  officeTitle: string;
}

export interface RoleOfficeTitle {
  id: number;
  roleId: number;
  roleName: string;
  title: string;
  createdAt: string;
}

export interface RoleRequest {
  name: string;
  description: string;
}

export interface CampusRequest {
  name: string;
  isMain: boolean;
}

export interface RoleOfficeTitleRequest {
  roleId: number;
  title: string;
}

export interface ResetPasswordResponse {
  user: CurrentUser;
  temporaryPassword: string;
}

export interface LoginAudit {
  id: number;
  email: string;
  wasSuccessful: boolean;
  reason: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);
  private readonly authService = inject(AuthService);
  private readonly baseUrl = this.apiUrl.url('/api/admin');

  getUsers(): Observable<CurrentUser[]> {
    return this.http.get<CurrentUser[]>(`${this.baseUrl}/users`, {
      headers: this.authService.authHeaders()
    });
  }

  getLoginAudits(): Observable<LoginAudit[]> {
    return this.http.get<LoginAudit[]>(`${this.baseUrl}/login-audits`, {
      headers: this.authService.authHeaders()
    });
  }

  createUser(payload: CreateUserRequest): Observable<CurrentUser> {
    return this.http.post<CurrentUser>(`${this.baseUrl}/users`, payload, {
      headers: this.authService.authHeaders()
    });
  }

  updateUserStatus(user: CurrentUser, isActive: boolean): Observable<CurrentUser> {
    return this.http.patch<CurrentUser>(
      `${this.baseUrl}/users/${user.id}/status`,
      { isActive },
      { headers: this.authService.authHeaders() }
    );
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/users/${id}`, {
      headers: this.authService.authHeaders()
    });
  }

  resetUserPassword(id: number): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(
      `${this.baseUrl}/users/${id}/reset-password`,
      {},
      { headers: this.authService.authHeaders() }
    );
  }

  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(`${this.baseUrl}/roles`, {
      headers: this.authService.authHeaders()
    });
  }

  createRole(payload: RoleRequest): Observable<Role> {
    return this.http.post<Role>(`${this.baseUrl}/roles`, payload, {
      headers: this.authService.authHeaders()
    });
  }

  updateRole(id: number, payload: RoleRequest): Observable<Role> {
    return this.http.patch<Role>(`${this.baseUrl}/roles/${id}`, payload, {
      headers: this.authService.authHeaders()
    });
  }

  deleteRole(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/roles/${id}`, {
      headers: this.authService.authHeaders()
    });
  }

  getCampuses(): Observable<Campus[]> {
    return this.http.get<Campus[]>(`${this.baseUrl}/campuses`, {
      headers: this.authService.authHeaders()
    });
  }

  createCampus(payload: CampusRequest): Observable<Campus> {
    return this.http.post<Campus>(`${this.baseUrl}/campuses`, payload, {
      headers: this.authService.authHeaders()
    });
  }

  updateCampus(id: number, payload: CampusRequest): Observable<Campus> {
    return this.http.patch<Campus>(`${this.baseUrl}/campuses/${id}`, payload, {
      headers: this.authService.authHeaders()
    });
  }

  deleteCampus(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/campuses/${id}`, {
      headers: this.authService.authHeaders()
    });
  }

  getRoleOfficeTitles(): Observable<RoleOfficeTitle[]> {
    return this.http.get<RoleOfficeTitle[]>(`${this.baseUrl}/role-office-titles`, {
      headers: this.authService.authHeaders()
    });
  }

  createRoleOfficeTitle(payload: RoleOfficeTitleRequest): Observable<RoleOfficeTitle> {
    return this.http.post<RoleOfficeTitle>(`${this.baseUrl}/role-office-titles`, payload, {
      headers: this.authService.authHeaders()
    });
  }

  updateRoleOfficeTitle(
    id: number,
    payload: RoleOfficeTitleRequest
  ): Observable<RoleOfficeTitle> {
    return this.http.patch<RoleOfficeTitle>(`${this.baseUrl}/role-office-titles/${id}`, payload, {
      headers: this.authService.authHeaders()
    });
  }

  deleteRoleOfficeTitle(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/role-office-titles/${id}`, {
      headers: this.authService.authHeaders()
    });
  }
}
