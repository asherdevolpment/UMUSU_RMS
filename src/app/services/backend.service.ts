import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BackendService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:5000';

  getStatus(): Observable<string> {
    return this.http.get(`${this.baseUrl}/`, { responseType: 'text' as const });
  }
}
