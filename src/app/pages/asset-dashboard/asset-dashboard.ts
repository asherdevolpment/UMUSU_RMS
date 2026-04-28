import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';
import { AssetItem, AssetService } from '../../services/asset.service';
import { AuthService } from '../../services/auth.service';

interface AssetMetric {
  label: string;
  value: string;
  helper: string;
  iconPath: string;
}

@Component({
  selector: 'app-asset-dashboard',
  imports: [NgOptimizedImage],
  template: `
    <main class="asset-shell">
      <aside class="sidebar" aria-label="Asset manager navigation">
        <img class="logo" ngSrc="/assets/umu%20logo.png" alt="Uganda Martyrs University crest" width="48" height="48" priority />
        <div>
          <p class="eyebrow">UMUSU RMS</p>
          <h1>Assets</h1>
        </div>

        <nav class="nav-list" aria-label="Asset sections">
          <a class="nav-item active" href="#inventory">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4V7Zm2 2v8h12V9H6Zm2-5h8v2H8V4Z" /></svg>
            Inventory
          </a>
          <a class="nav-item" href="#allocations">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5Zm-7 8 7 4 7-4v5l-7 4-7-4v-5Z" /></svg>
            Allocations
          </a>
          <a class="nav-item" href="#managers">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H5Z" /></svg>
            Managers
          </a>
        </nav>

        <button class="logout" type="button" (click)="logout()">Logout</button>
      </aside>

      <section class="content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Asset management</p>
            <h2>Shared university assets</h2>
            <span>{{ officeTitle() }} · {{ campusName() }}</span>
          </div>
          <div class="profile" aria-label="Signed in user">
            <span>{{ userInitial() }}</span>
            <div>
              <strong>{{ userName() }}</strong>
              <small>{{ roleName() }}</small>
            </div>
          </div>
        </header>

        @if (errorMessage()) {
          <p class="alert">{{ errorMessage() }}</p>
        }

        <section class="metrics" aria-label="Asset summary">
          @for (metric of metrics(); track metric.label) {
            <article class="metric-card">
              <span class="metric-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="metric.iconPath" /></svg>
              </span>
              <p>{{ metric.label }}</p>
              <strong>{{ metric.value }}</strong>
              <small>{{ metric.helper }}</small>
            </article>
          }
        </section>

        <section id="inventory" class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Inventory</p>
              <h3>Assets by office</h3>
            </div>
            <span>{{ assets().length }} asset groups</span>
          </div>

          <div class="asset-grid">
            @for (asset of assets(); track asset.id) {
              <article class="asset-card">
                <div class="asset-card-head">
                  <span class="asset-symbol">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="assetIcon(asset.assetType)" /></svg>
                  </span>
                  <div>
                    <h4>{{ asset.name }}</h4>
                    <p>{{ asset.managerOffice }}</p>
                  </div>
                </div>

                <div class="asset-numbers">
                  <span>
                    <strong>{{ asset.availableQuantity }}</strong>
                    available
                  </span>
                  <span>
                    <strong>{{ asset.totalQuantity }}</strong>
                    total
                  </span>
                </div>

                <div class="availability" aria-label="Availability">
                  <span [style.width.%]="availabilityPercent(asset)"></span>
                </div>

                <footer>
                  <span>{{ asset.assetType }}</span>
                  <b [class.warning]="asset.availableQuantity < asset.totalQuantity">{{ assetStatus(asset) }}</b>
                </footer>
              </article>
            }
          </div>
        </section>

        <section class="two-column">
          <article id="allocations" class="panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Current use</p>
                <h3>Issued assets</h3>
              </div>
              <span>{{ issuedCount() }} out</span>
            </div>

            @if (issuedCount() === 0) {
              <div class="empty-state">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 15.2 7.6-7.6L19 9l-9 9-5-5 1.4-1.4 3.6 3.6Z" /></svg>
                <p>All seeded assets are currently available.</p>
              </div>
            } @else {
              @for (asset of issuedAssets(); track asset.id) {
                <div class="issue-row">
                  <strong>{{ asset.name }}</strong>
                  <span>{{ asset.totalQuantity - asset.availableQuantity }} issued</span>
                </div>
              }
            }
          </article>

          <article id="managers" class="panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Responsibility</p>
                <h3>Managing offices</h3>
              </div>
            </div>

            @for (manager of managerRows(); track manager.office) {
              <div class="manager-row">
                <span>{{ manager.office.slice(0, 1) }}</span>
                <div>
                  <strong>{{ manager.office }}</strong>
                  <small>{{ manager.count }} asset group(s) under management</small>
                </div>
              </div>
            }
          </article>
        </section>
      </section>
    </main>
  `,
  styles: `
    :host {
      display: block;
    }

    .asset-shell {
      background: #f6f7fb;
      color: #111827;
      display: grid;
      grid-template-columns: 260px 1fr;
      min-height: 100dvh;
    }

    .sidebar {
      background: #01062d;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 24px 18px;
    }

    .logo {
      background: #ffffff;
      border-radius: 14px;
      height: 52px;
      object-fit: contain;
      padding: 5px;
      width: 52px;
    }

    .eyebrow {
      color: #6b7280;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0;
      margin: 0;
      text-transform: uppercase;
    }

    .sidebar .eyebrow {
      color: #f7c948;
    }

    h1,
    h2,
    h3,
    h4,
    p {
      margin: 0;
    }

    h1 {
      font-size: 1.35rem;
    }

    h2 {
      font-size: 1.55rem;
    }

    h3 {
      font-size: 1rem;
    }

    h4 {
      font-size: 0.96rem;
    }

    .nav-list {
      display: grid;
      gap: 8px;
    }

    .nav-item,
    .logout {
      align-items: center;
      border-radius: 10px;
      display: flex;
      gap: 10px;
      min-height: 42px;
      padding: 0 12px;
    }

    .nav-item {
      color: #cbd5e1;
      font-size: 0.9rem;
      font-weight: 700;
      text-decoration: none;
    }

    .nav-item:hover,
    .nav-item:focus-visible,
    .nav-item.active {
      background: rgb(255 255 255 / 12%);
      color: #ffffff;
      outline: none;
    }

    svg {
      fill: currentColor;
      height: 20px;
      width: 20px;
    }

    .logout {
      background: #f7c948;
      border: 0;
      color: #111827;
      cursor: pointer;
      font: inherit;
      font-weight: 900;
      margin-top: auto;
      justify-content: center;
    }

    .content {
      display: grid;
      gap: 20px;
      padding: 24px;
    }

    .topbar,
    .panel,
    .metric-card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      box-shadow: 0 12px 28px rgb(17 24 39 / 5%);
    }

    .topbar {
      align-items: center;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 18px;
    }

    .topbar span,
    small,
    .asset-card p {
      color: #667085;
    }

    .profile {
      align-items: center;
      display: flex;
      gap: 10px;
      min-width: fit-content;
    }

    .profile > span,
    .manager-row > span {
      align-items: center;
      background: #01062d;
      border-radius: 999px;
      color: #ffffff;
      display: grid;
      font-weight: 900;
      height: 40px;
      place-items: center;
      width: 40px;
    }

    .profile div,
    .manager-row div {
      display: grid;
      gap: 2px;
    }

    .alert {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 10px;
      color: #991b1b;
      font-weight: 700;
      padding: 12px 14px;
    }

    .metrics {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .metric-card {
      display: grid;
      gap: 8px;
      padding: 16px;
      transition: transform 160ms ease, box-shadow 160ms ease;
    }

    .metric-card:hover {
      box-shadow: 0 18px 34px rgb(17 24 39 / 9%);
      transform: translateY(-2px);
    }

    .metric-card strong {
      font-size: 1.45rem;
    }

    .metric-icon,
    .asset-symbol {
      align-items: center;
      background: #eef2ff;
      border-radius: 12px;
      color: #01062d;
      display: grid;
      height: 38px;
      place-items: center;
      width: 38px;
    }

    .panel {
      display: grid;
      gap: 16px;
      padding: 18px;
    }

    .section-heading {
      align-items: center;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .section-heading > span {
      background: #fff7cc;
      border-radius: 999px;
      color: #7c5200;
      font-size: 0.78rem;
      font-weight: 800;
      padding: 6px 10px;
      white-space: nowrap;
    }

    .asset-grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .asset-card {
      border: 1px solid #edf0f4;
      border-radius: 12px;
      display: grid;
      gap: 14px;
      padding: 14px;
    }

    .asset-card-head,
    .asset-numbers,
    .asset-card footer,
    .manager-row,
    .issue-row {
      align-items: center;
      display: flex;
      gap: 10px;
      justify-content: space-between;
    }

    .asset-card-head {
      justify-content: flex-start;
    }

    .asset-numbers span {
      display: grid;
      gap: 2px;
    }

    .asset-numbers strong {
      font-size: 1.1rem;
    }

    .availability {
      background: #eef2f7;
      border-radius: 999px;
      height: 8px;
      overflow: hidden;
    }

    .availability span {
      background: #169b62;
      border-radius: inherit;
      display: block;
      height: 100%;
    }

    footer span,
    footer b {
      border-radius: 999px;
      font-size: 0.72rem;
      padding: 5px 8px;
    }

    footer span {
      background: #eef2ff;
      color: #1f2a68;
    }

    footer b {
      background: #dcfce7;
      color: #166534;
    }

    footer b.warning {
      background: #fff7ed;
      color: #9a3412;
    }

    .two-column {
      display: grid;
      gap: 20px;
      grid-template-columns: 1fr 1fr;
    }

    .empty-state {
      align-items: center;
      border: 1px dashed #cbd5e1;
      border-radius: 12px;
      color: #475467;
      display: flex;
      gap: 10px;
      padding: 18px;
    }

    .empty-state svg {
      color: #169b62;
    }

    .issue-row,
    .manager-row {
      border-top: 1px solid #edf0f4;
      padding-top: 12px;
    }

    .manager-row {
      justify-content: flex-start;
    }

    .manager-row > span {
      background: #f7c948;
      color: #111827;
    }

    @media (max-width: 1080px) {
      .asset-shell {
        grid-template-columns: 1fr;
      }

      .sidebar {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
      }

      .nav-list {
        display: flex;
        flex-wrap: wrap;
      }

      .logout {
        margin-left: auto;
        margin-top: 0;
      }

      .metrics,
      .asset-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 720px) {
      .content {
        padding: 14px;
      }

      .topbar,
      .section-heading,
      .asset-card footer {
        align-items: flex-start;
        flex-direction: column;
      }

      .profile {
        width: 100%;
      }

      .metrics,
      .asset-grid,
      .two-column {
        grid-template-columns: 1fr;
      }

      .sidebar {
        padding: 16px;
      }

      .nav-item {
        flex: 1 1 140px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssetDashboard implements OnInit {
  private readonly assetService = inject(AssetService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly assets = signal<AssetItem[]>([]);
  protected readonly errorMessage = signal('');
  protected readonly userName = computed(() => this.authService.currentUser()?.fullName ?? 'Asset manager');
  protected readonly roleName = computed(() => this.authService.currentUser()?.role.name ?? 'Asset Officer');
  protected readonly officeTitle = computed(() => this.authService.currentUser()?.officeTitle ?? 'Asset Office');
  protected readonly campusName = computed(() => this.authService.currentUser()?.campus.name ?? 'Campus');
  protected readonly userInitial = computed(() => this.userName().slice(0, 1));
  protected readonly totalQuantity = computed(() =>
    this.assets().reduce((total, asset) => total + asset.totalQuantity, 0)
  );
  protected readonly availableQuantity = computed(() =>
    this.assets().reduce((total, asset) => total + asset.availableQuantity, 0)
  );
  protected readonly issuedCount = computed(() => this.totalQuantity() - this.availableQuantity());
  protected readonly issuedAssets = computed(() =>
    this.assets().filter((asset) => asset.availableQuantity < asset.totalQuantity)
  );
  protected readonly managerRows = computed(() => {
    const counts = new Map<string, number>();

    for (const asset of this.assets()) {
      counts.set(asset.managerOffice, (counts.get(asset.managerOffice) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([office, count]) => ({ office, count }));
  });
  protected readonly metrics = computed<AssetMetric[]>(() => [
    {
      label: 'Asset Groups',
      value: String(this.assets().length),
      helper: 'Vehicles, tents, chairs, sports equipment',
      iconPath: 'M4 7h16v12H4V7Zm2 2v8h12V9H6Zm2-5h8v2H8V4Z'
    },
    {
      label: 'Total Quantity',
      value: this.totalQuantity().toLocaleString('en-US'),
      helper: 'All recorded shared assets',
      iconPath: 'M12 3 3 8l9 5 9-5-9-5Zm-7 8 7 4 7-4v5l-7 4-7-4v-5Z'
    },
    {
      label: 'Available',
      value: this.availableQuantity().toLocaleString('en-US'),
      helper: 'Ready for approved requisitions',
      iconPath: 'm10 15.2 7.6-7.6L19 9l-9 9-5-5 1.4-1.4 3.6 3.6Z'
    },
    {
      label: 'Issued / Reserved',
      value: this.issuedCount().toLocaleString('en-US'),
      helper: 'Assets currently out',
      iconPath: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm1-10V7h-2v7h6v-2h-4Z'
    }
  ]);

  ngOnInit(): void {
    this.assetService.getAssetItems().subscribe({
      next: (items) => this.assets.set(items),
      error: () => this.errorMessage.set('Could not load assets. Confirm the backend is running.')
    });
  }

  protected availabilityPercent(asset: AssetItem): number {
    if (asset.totalQuantity <= 0) {
      return 0;
    }

    return Math.round((asset.availableQuantity / asset.totalQuantity) * 100);
  }

  protected assetStatus(asset: AssetItem): string {
    if (asset.availableQuantity === 0) {
      return 'Unavailable';
    }

    if (asset.availableQuantity < asset.totalQuantity) {
      return 'Partly issued';
    }

    return asset.status;
  }

  protected assetIcon(assetType: string): string {
    switch (assetType) {
      case 'Vehicle':
        return 'M5 11 7 6h10l2 5h1v7h-2a2 2 0 0 1-4 0H10a2 2 0 0 1-4 0H4v-7h1Zm3.4-3-1.2 3h9.6l-1.2-3H8.4Z';
      case 'Tent':
        return 'M12 3 3 20h18L12 3Zm0 5.2 4.6 9.8H7.4L12 8.2Z';
      case 'Chair':
        return 'M7 3h10v8H9v4h8v6h-2v-4H9v4H7V3Zm2 2v4h6V5H9Z';
      default:
        return 'M12 2 4 6v12l8 4 8-4V6l-8-4Zm0 2.2L17.8 7 12 9.8 6.2 7 12 4.2ZM6 9.2l5 2.5v7.6l-5-2.5V9.2Zm12 0v7.6l-5 2.5v-7.6l5-2.5Z';
    }
  }

  protected logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
