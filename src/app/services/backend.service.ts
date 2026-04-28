import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';

@Injectable({
  providedIn: 'root'
})
export class BackendService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);

  getStatus(): Observable<string> {
    return this.http.get(this.apiUrl.url('/'), { responseType: 'text' as const });
  }
}
