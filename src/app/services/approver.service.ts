import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { AuthService } from './auth.service';
import { Requisition } from './requester.service';

@Injectable({
  providedIn: 'root'
})
export class ApproverService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);
  private readonly authService = inject(AuthService);

  getRequisitions(): Observable<Requisition[]> {
    return this.http.get<Requisition[]>(this.apiUrl.url('/api/approver/requisitions'), {
      headers: this.authService.authHeaders()
    });
  }
}
