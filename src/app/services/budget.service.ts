import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { AuthService } from './auth.service';
import { BudgetItem } from './requester.service';

export interface BudgetItemRequest {
  officeTitle: string;
  budgetTitle: string;
  academicYear: string;
  termLabel: string;
  semesterScope: string;
  sectionName: string;
  itemName: string;
  quantity: number | null;
  unitCost: number | null;
  totalAmount: number | null;
  semesterLabel: string;
}

@Injectable({
  providedIn: 'root'
})
export class BudgetService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);
  private readonly authService = inject(AuthService);
  private readonly baseUrl = this.apiUrl.url('/api/budget');

  getBudgetItems(): Observable<BudgetItem[]> {
    return this.http.get<BudgetItem[]>(`${this.baseUrl}/items`, {
      headers: this.authService.authHeaders()
    });
  }

  createBudgetItem(payload: BudgetItemRequest): Observable<BudgetItem> {
    return this.http.post<BudgetItem>(`${this.baseUrl}/items`, payload, {
      headers: this.authService.authHeaders()
    });
  }
}
