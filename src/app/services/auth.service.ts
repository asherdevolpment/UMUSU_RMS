import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiUrlService } from './api-url.service';

export interface Role {
  id: number;
  name: string;
  description?: string;
}

export interface Campus {
  id: number;
  name: string;
  isMain: boolean;
}

export interface CurrentUser {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  campus: Campus;
  officeTitle: string;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

interface LoginResponse {
  token: string;
  user: CurrentUser;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);
  private readonly tokenKey = 'umusu_rms_token';
  private readonly userKey = 'umusu_rms_user';

  readonly token = signal<string | null>(this.readToken());
  readonly currentUser = signal<CurrentUser | null>(this.readUser());
  readonly isLoggedIn = computed(() => Boolean(this.token() && this.currentUser()));
  readonly isAdmin = computed(() => this.currentUser()?.role.name === 'Admin');
  readonly defaultRoute = computed(() => {
    if (this.currentUser()?.mustChangePassword) {
      return '/change-password';
    }

    const roleName = this.currentUser()?.role.name;

    if (roleName === 'Admin') {
      return '/admin';
    }

    if (roleName === 'Requester') {
      return '/requester';
    }

    if (roleName === 'Asset Officer') {
      return '/assets';
    }

    if (roleName === 'Budget Officer' || roleName === 'Finance Officer') {
      return '/budget';
    }

    return '/approver';
  });

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(this.apiUrl.url('/api/auth/login'), { email, password })
      .pipe(tap((response) => this.setSession(response)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        this.apiUrl.url('/api/auth/change-password'),
        { currentPassword, newPassword },
        { headers: this.authHeaders() }
      )
      .pipe(tap((response) => this.setSession(response)));
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.token.set(null);
    this.currentUser.set(null);
  }

  authHeaders(): HttpHeaders {
    const token = this.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private setSession(response: LoginResponse): void {
    localStorage.setItem(this.tokenKey, response.token);
    localStorage.setItem(this.userKey, JSON.stringify(response.user));
    this.token.set(response.token);
    this.currentUser.set(response.user);
  }

  private readToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  private readUser(): CurrentUser | null {
    const storedUser = localStorage.getItem(this.userKey);

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as CurrentUser;
    } catch {
      localStorage.removeItem(this.userKey);
      return null;
    }
  }
}
