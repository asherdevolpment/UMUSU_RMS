import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';
import { ApproverService } from '../../services/approver.service';
import { AuthService } from '../../services/auth.service';
import { Requisition } from '../../services/requester.service';

@Component({
  selector: 'app-approver-dashboard',
  imports: [NgOptimizedImage],
  template: `
    <main class="approver-shell">
      <aside class="sidebar" aria-label="Approver navigation">
        <img class="logo" ngSrc="/assets/umu%20logo.png" alt="Uganda Martyrs University crest" width="48" height="48" priority />
        <div>
          <p class="eyebrow">UMUSU RMS</p>
          <h1>Approvals</h1>
        </div>
        <nav aria-label="Approval sections">
          <a class="nav-link active" href="#queue">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v4H4V5Zm0 6h16v8H4v-8Zm2 2v4h12v-4H6Z" /></svg>
            Review Queue
          </a>
          <a class="nav-link" href="#flow">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4h2v5h5v2h-5v2h5v2h-5v5h-2v-5H6v-2h5v-2H6V9h5V4Z" /></svg>
            Workflow
          </a>
        </nav>
        <button type="button" (click)="logout()">Logout</button>
      </aside>

      <section class="content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Approver workspace</p>
            <h2>{{ roleName() }} dashboard</h2>
            <span>{{ userName() }} / {{ officeTitle() }} / {{ campusName() }}</span>
          </div>
          <div class="avatar" aria-label="Signed in user">{{ userInitial() }}</div>
        </header>

        <section id="queue" class="metrics" aria-label="Approval summary">
          <article>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5V4Zm3 4h8V6H8v2Zm0 4h8v-2H8v2Zm0 4h5v-2H8v2Z" /></svg>
            <p>Pending Reviews</p>
            <strong>{{ pendingCount() }}</strong>
            <small>Submitted requisitions awaiting review</small>
          </article>
          <article>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 15.2 7.6-7.6L19 9l-9 9-5-5 1.4-1.4 3.6 3.6Z" /></svg>
            <p>Approved Today</p>
            <strong>{{ approvedCount() }}</strong>
            <small>Approved or pending payment</small>
          </article>
          <article>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm1-10V7h-2v7h6v-2h-4Z" /></svg>
            <p>Returned</p>
            <strong>{{ returnedCount() }}</strong>
            <small>Requests sent back for correction</small>
          </article>
        </section>

        <section class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Queue</p>
              <h3>Submitted requisitions</h3>
            </div>
            <span>{{ requisitions().length }} visible</span>
          </div>

          @if (errorMessage()) {
            <p class="alert">{{ errorMessage() }}</p>
          }

          @if (requisitions().length === 0 && !errorMessage()) {
            <div class="empty-state">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 15.2 7.6-7.6L19 9l-9 9-5-5 1.4-1.4 3.6 3.6Z" /></svg>
              <p>No submitted requisitions are waiting in the queue yet.</p>
            </div>
          } @else {
            <div class="queue-list">
              @for (requisition of requisitions(); track requisition.id) {
                <article class="queue-card">
                  <div>
                    <span class="status-pill">{{ requisition.status }}</span>
                    <h4>{{ requisition.title }}</h4>
                    <p>{{ requisition.referenceNo }} / {{ requisition.campus.name }} / {{ requisition.requester.fullName }}</p>
                  </div>
                  <div class="queue-meta">
                    <strong>{{ formatMoney(requisition.amount) }}</strong>
                    <small>{{ requisition.currentStep }}</small>
                  </div>
                </article>
              }
            </div>
          }
        </section>

        <section id="flow" class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Hierarchy</p>
              <h3>Approval path</h3>
            </div>
            <span>Role based</span>
          </div>

          <div class="flow-grid">
            @for (step of approvalFlow(); track step.title) {
              <article class="flow-card" [class.active]="step.active">
                <span>{{ step.order }}</span>
                <div>
                  <h4>{{ step.title }}</h4>
                  <p>{{ step.description }}</p>
                </div>
              </article>
            }
          </div>
        </section>

        <section class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Documents</p>
              <h3>What reviewers should check</h3>
            </div>
          </div>
          <div class="review-list">
            <p>Budget spreadsheet totals, activity purpose, supporting PDFs, campus ownership, and return dates for assets.</p>
            <p>Budget Office marks the request as ready with the CFO office, which becomes pending payment in the system.</p>
          </div>
        </section>
      </section>
    </main>
  `,
  styles: `
    .approver-shell {
      background: #f6f7fb;
      color: #101828;
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

    .content {
      display: grid;
      gap: 18px;
      padding: 24px;
    }

    .topbar,
    .panel,
    .metrics article {
      background: #ffffff;
      border: 1px solid #edf0f4;
      border-radius: 14px;
      box-shadow: 0 12px 24px rgb(16 24 40 / 4%);
    }

    .topbar {
      align-items: center;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 18px;
    }

    .panel {
      display: grid;
      gap: 16px;
      padding: 18px;
    }

    .logo {
      background: #ffffff;
      border: 1px solid #e4e7ec;
      border-radius: 12px;
      height: 48px;
      object-fit: contain;
      padding: 4px;
      width: 48px;
    }

    .eyebrow {
      color: #667085;
      font-size: 0.75rem;
      font-weight: 800;
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
      font-size: 1.5rem;
    }

    h3 {
      font-size: 1rem;
    }

    h4 {
      font-size: 0.96rem;
    }

    span {
      color: #475467;
    }

    .sidebar span,
    .sidebar h1 {
      color: #ffffff;
    }

    nav {
      display: grid;
      gap: 8px;
    }

    .nav-link {
      align-items: center;
      border-radius: 10px;
      color: #cbd5e1;
      display: flex;
      font-weight: 700;
      gap: 10px;
      min-height: 42px;
      padding: 0 12px;
      text-decoration: none;
    }

    .nav-link:hover,
    .nav-link:focus-visible,
    .nav-link.active {
      background: rgb(255 255 255 / 12%);
      color: #ffffff;
      outline: none;
    }

    button {
      background: #f7c948;
      border: 0;
      border-radius: 8px;
      color: #111827;
      cursor: pointer;
      font: inherit;
      font-weight: 900;
      margin-top: auto;
      min-height: 38px;
      padding: 0 14px;
    }

    svg {
      fill: currentColor;
      height: 20px;
      width: 20px;
    }

    .avatar {
      align-items: center;
      background: #01062d;
      border-radius: 999px;
      color: #ffffff;
      display: grid;
      font-weight: 900;
      height: 42px;
      place-items: center;
      width: 42px;
    }

    .metrics {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .metrics article {
      display: grid;
      gap: 8px;
      padding: 16px;
      transition: transform 160ms ease, box-shadow 160ms ease;
    }

    .metrics article:hover,
    .queue-card:hover {
      box-shadow: 0 18px 34px rgb(17 24 39 / 9%);
      transform: translateY(-2px);
    }

    .metrics svg {
      background: #eef2ff;
      border-radius: 12px;
      color: #01062d;
      height: 38px;
      padding: 9px;
      width: 38px;
    }

    .metrics strong {
      font-size: 1.45rem;
    }

    small,
    .flow-card p,
    .review-list p,
    .topbar span {
      color: #667085;
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
    }

    .flow-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .flow-card {
      border: 1px solid #edf0f4;
      border-radius: 12px;
      display: flex;
      gap: 12px;
      padding: 14px;
    }

    .flow-card > span {
      align-items: center;
      background: #eef2ff;
      border-radius: 999px;
      color: #01062d;
      display: grid;
      flex: 0 0 auto;
      font-weight: 900;
      height: 32px;
      place-items: center;
      width: 32px;
    }

    .flow-card.active {
      border-color: #01062d;
      box-shadow: 0 12px 26px rgb(1 6 45 / 9%);
    }

    .review-list {
      display: grid;
      gap: 10px;
    }

    .alert {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 10px;
      color: #991b1b;
      font-weight: 700;
      padding: 12px 14px;
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

    .queue-list {
      display: grid;
      gap: 12px;
    }

    .queue-card {
      align-items: center;
      border: 1px solid #edf0f4;
      border-radius: 12px;
      display: flex;
      gap: 12px;
      justify-content: space-between;
      padding: 14px;
      transition: transform 160ms ease, box-shadow 160ms ease;
    }

    .status-pill {
      background: #eef2ff;
      border-radius: 999px;
      color: #1f2a68;
      display: inline-flex;
      font-size: 0.72rem;
      font-weight: 900;
      margin-bottom: 8px;
      padding: 5px 8px;
    }

    .queue-meta {
      display: grid;
      gap: 4px;
      justify-items: end;
      text-align: right;
    }

    @media (max-width: 980px) {
      .approver-shell {
        grid-template-columns: 1fr;
      }

      .sidebar {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
      }

      nav {
        display: flex;
        flex-wrap: wrap;
      }

      button {
        margin-left: auto;
        margin-top: 0;
      }

      .flow-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 700px) {
      .content {
        padding: 14px;
      }

      .topbar,
      .section-heading {
        align-items: flex-start;
        flex-direction: column;
      }

      .metrics,
      .flow-grid {
        grid-template-columns: 1fr;
      }

      .queue-card {
        align-items: flex-start;
        flex-direction: column;
      }

      .queue-meta {
        justify-items: start;
        text-align: left;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApproverDashboard implements OnInit {
  private readonly approverService = inject(ApproverService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly requisitions = signal<Requisition[]>([]);
  protected readonly errorMessage = signal('');
  protected readonly userName = computed(() => this.authService.currentUser()?.fullName ?? 'Approver');
  protected readonly roleName = computed(() => this.authService.currentUser()?.role.name ?? 'Approver');
  protected readonly officeTitle = computed(() => this.authService.currentUser()?.officeTitle ?? 'Approver');
  protected readonly campusName = computed(() => this.authService.currentUser()?.campus.name ?? 'Campus');
  protected readonly userInitial = computed(() => this.userName().slice(0, 1));
  protected readonly pendingCount = computed(() =>
    this.requisitions().filter((requisition) => requisition.status === 'Submitted').length
  );
  protected readonly approvedCount = computed(() =>
    this.requisitions().filter(
      (requisition) => requisition.status === 'Approved' || requisition.status === 'Pending Payment'
    ).length
  );
  protected readonly returnedCount = computed(() =>
    this.requisitions().filter((requisition) => requisition.status === 'Returned').length
  );
  protected readonly approvalFlow = computed(() => {
    const office = this.officeTitle();

    return [
      {
        order: '1',
        title: 'Campus review',
        description: 'Governor, campus finance, chairperson, director, and campus dean review non-main-campus requests.',
        active: this.roleName() === 'Campus Approver'
      },
      {
        order: '2',
        title: 'Main UMUSU signatories',
        description: 'Secretary in charge, finance secretary, union president, and union chairperson verify the request.',
        active: this.roleName() === 'Union Approver'
      },
      {
        order: '3',
        title: 'Dean of Students',
        description: 'Dean recommends after cross-checking details and supporting documents with leadership.',
        active: office === 'Dean of Students'
      },
      {
        order: '4',
        title: 'Finance office',
        description: 'CFO office reviews the finance position and readiness for budget confirmation.',
        active: this.roleName() === 'Finance Officer'
      },
      {
        order: '5',
        title: 'Budget confirmation',
        description: 'Budget officer checks the budget spreadsheet, PDFs, invoices, and marks pending payment.',
        active: this.roleName() === 'Budget Officer'
      },
      {
        order: '6',
        title: 'Pending payment',
        description: 'System stops at payment readiness instead of managing cheque withdrawal and cash movement.',
        active: false
      }
    ];
  });

  ngOnInit(): void {
    this.approverService.getRequisitions().subscribe({
      next: (requisitions) => this.requisitions.set(requisitions),
      error: () => this.errorMessage.set('Could not load approval queue. Confirm the backend is running.')
    });
  }

  protected formatMoney(amount: number | null): string {
    if (amount === null) {
      return 'No amount';
    }

    return `UGX ${amount.toLocaleString('en-US')}`;
  }

  protected logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
