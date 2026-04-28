import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { AuthService, Campus } from './auth.service';

export type RequisitionStatus = 'Draft' | 'Submitted' | 'Returned' | 'Rejected' | 'Pending Payment' | 'Approved';

export interface RequisitionRequester {
  id: number;
  fullName: string;
  email: string;
}

export interface Requisition {
  id: number;
  referenceNo: string;
  requester: RequisitionRequester;
  campus: Campus;
  category: string;
  subcategory: string | null;
  title: string;
  purpose: string;
  amount: number | null;
  neededDate: string | null;
  details: RequisitionDetails;
  status: RequisitionStatus;
  currentStep: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequisitionDetails {
  budgetItemId?: number | null;
  budgetLine?: string;
  plannedBudget?: number | null;
  lineItems?: string;
  isUnbudgeted?: boolean;
  unbudgetedJustification?: string;
  activityDate?: string | null;
  venue?: string;
  expectedParticipants?: number | null;
  activityLead?: string;
  expenseType?: string;
  urgencyReason?: string;
  accountabilityDate?: string | null;
  assetType?: string;
  quantity?: number | null;
  usageDate?: string | null;
  returnDate?: string | null;
  destination?: string;
  responsiblePerson?: string;
}

export interface RequisitionEvent {
  id: number;
  requisitionId: number;
  eventType: string;
  note: string;
  actor: {
    id: number;
    fullName: string;
  };
  createdAt: string;
}

export interface RequisitionDocument {
  id: number;
  requisitionId: number;
  uploadedBy: number;
  documentType: 'Budget Spreadsheet' | 'Supporting PDF';
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface RequisitionRequest {
  category: string;
  subcategory: string;
  title: string;
  purpose: string;
  amount: number | null;
  neededDate: string | null;
  details: RequisitionDetails;
  submit: boolean;
}

export interface BudgetItem {
  id: number;
  budgetId: number;
  budgetTitle: string;
  officeTitle: string;
  academicYear: string;
  termLabel: string;
  semesterScope: string;
  approvedBy: string;
  sectionName: string;
  itemName: string;
  quantity: number | null;
  unitCost: number | null;
  totalAmount: number;
  semesterLabel: string;
}

@Injectable({
  providedIn: 'root'
})
export class RequesterService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);
  private readonly authService = inject(AuthService);
  private readonly baseUrl = this.apiUrl.url('/api/requester');

  getRequisitions(): Observable<Requisition[]> {
    return this.http.get<Requisition[]>(`${this.baseUrl}/requisitions`, {
      headers: this.authService.authHeaders()
    });
  }

  getBudgetItems(): Observable<BudgetItem[]> {
    return this.http.get<BudgetItem[]>(`${this.baseUrl}/budget-items`, {
      headers: this.authService.authHeaders()
    });
  }

  createRequisition(payload: RequisitionRequest): Observable<Requisition> {
    return this.http.post<Requisition>(`${this.baseUrl}/requisitions`, payload, {
      headers: this.authService.authHeaders()
    });
  }

  updateRequisition(id: number, payload: Omit<RequisitionRequest, 'submit'>): Observable<Requisition> {
    return this.http.patch<Requisition>(`${this.baseUrl}/requisitions/${id}`, payload, {
      headers: this.authService.authHeaders()
    });
  }

  submitRequisition(id: number): Observable<Requisition> {
    return this.http.post<Requisition>(
      `${this.baseUrl}/requisitions/${id}/submit`,
      {},
      { headers: this.authService.authHeaders() }
    );
  }

  getRequisitionEvents(id: number): Observable<RequisitionEvent[]> {
    return this.http.get<RequisitionEvent[]>(`${this.baseUrl}/requisitions/${id}/events`, {
      headers: this.authService.authHeaders()
    });
  }

  getRequisitionDocuments(id: number): Observable<RequisitionDocument[]> {
    return this.http.get<RequisitionDocument[]>(`${this.baseUrl}/requisitions/${id}/documents`, {
      headers: this.authService.authHeaders()
    });
  }

  uploadDocuments(
    id: number,
    budgetFile: File | null,
    supportingFiles: File[]
  ): Observable<RequisitionDocument[]> {
    const formData = new FormData();

    if (budgetFile) {
      formData.append('budget', budgetFile);
    }

    for (const file of supportingFiles) {
      formData.append('supporting', file);
    }

    return this.http.post<RequisitionDocument[]>(
      `${this.baseUrl}/requisitions/${id}/documents`,
      formData,
      { headers: this.authService.authHeaders() }
    );
  }
}
