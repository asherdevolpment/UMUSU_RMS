import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ApiUrlService {
  private readonly document = inject(DOCUMENT);
  private readonly backendPort = '5050';

  readonly rootUrl = `${this.document.location.protocol}//${this.document.location.hostname}:${this.backendPort}`;

  url(path = ''): string {
    return `${this.rootUrl}${path}`;
  }
}
