import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

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
  private readonly baseUrl = 'http://localhost:5000';

  readonly result = signal<NlpAnalysis | null>(null);

  analyzeText(text: string): Observable<NlpAnalysis> {
    return this.http
      .post<NlpAnalysis>(`${this.baseUrl}/api/nlp/analyze`, { text })
      .pipe(tap((analysis) => this.result.set(analysis)));
  }
}
