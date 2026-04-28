import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiUrlService } from './api-url.service';

export interface NlpAnalysis {
  id: number;
  text: string;
  summary: string;
  keywords: string[];
  category: string;
}

@Injectable({
  providedIn: 'root'
})
export class NlpService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);

  readonly result = signal<NlpAnalysis | null>(null);

  analyzeText(text: string): Observable<NlpAnalysis> {
    return this.http
      .post<NlpAnalysis>(this.apiUrl.url('/api/nlp/analyze'), { text })
      .pipe(tap((analysis) => this.result.set(analysis)));
  }
}
