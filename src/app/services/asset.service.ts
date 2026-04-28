import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { AuthService } from './auth.service';

export interface AssetItem {
  id: number;
  name: string;
  assetType: string;
  managerOffice: string;
  totalQuantity: number;
  availableQuantity: number;
  status: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class AssetService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);
  private readonly authService = inject(AuthService);

  getAssetItems(): Observable<AssetItem[]> {
    return this.http.get<AssetItem[]>(this.apiUrl.url('/api/assets/items'), {
      headers: this.authService.authHeaders()
    });
  }
}
