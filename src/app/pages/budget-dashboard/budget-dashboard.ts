import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BudgetItem } from '../../services/requester.service';
import { BudgetItemRequest, BudgetService } from '../../services/budget.service';

interface BudgetMetric {
  label: string;
  value: string;
  helper: string;
}

@Component({
  selector: 'app-budget-dashboard',
  imports: [NgOptimizedImage, ReactiveFormsModule],
  template: `
    <main class="budget-shell">
      <aside class="sidebar" aria-label="Budget officer navigation">
        <img class="logo" ngSrc="/assets/umu%20logo.png" alt="Uganda Martyrs University crest" width="48" height="48" priority />
        <div>
          <p class="eyebrow">UMUSU RMS</p>
          <h1>Budgets</h1>
        </div>

        <nav aria-label="Budget sections">
          <a class="nav-link active" href="#baseline">Baseline</a>
          <a class="nav-link" href="#new-line">Add line</a>
          <a class="nav-link" href="#variance">Variance</a>
        </nav>

        <button type="button" class="logout" (click)="logout()">Logout</button>
      </aside>

      <section class="content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Budget office</p>
            <h2>Council-approved budget baseline</h2>
            <span>{{ userName() }} / {{ officeTitle() }} / {{ campusName() }}</span>
          </div>
          <span class="avatar" aria-label="Signed in user">{{ userInitial() }}</span>
        </header>

        @if (errorMessage()) {
          <p class="alert error" role="alert">{{ errorMessage() }}</p>
        }

        @if (successMessage()) {
          <p class="alert success" role="status">{{ successMessage() }}</p>
        }

        <section class="metrics" aria-label="Budget summary">
          @for (metric of metrics(); track metric.label) {
            <article>
              <p>{{ metric.label }}</p>
              <strong>{{ metric.value }}</strong>
              <span>{{ metric.helper }}</span>
            </article>
          }
        </section>

        <section class="grid">
          <section id="baseline" class="panel baseline-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Official baseline</p>
                <h3>Approved budget lines</h3>
              </div>
              <span>{{ budgetItems().length }} lines</span>
            </div>

            @if (isLoading()) {
              <div class="empty-state">Loading budget baseline...</div>
            } @else if (budgetItems().length === 0) {
              <div class="empty-state">No budget lines have been added yet.</div>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Office</th>
                      <th>Section</th>
                      <th>Item</th>
                      <th>Semester</th>
                      <th class="number">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of budgetItems(); track item.id) {
                      <tr>
                        <td>{{ item.officeTitle }}</td>
                        <td>{{ item.sectionName }}</td>
                        <td>{{ item.itemName }}</td>
                        <td>{{ item.semesterLabel }}</td>
                        <td class="number">{{ formatMoney(item.totalAmount) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>

          <section id="new-line" class="panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Budget control</p>
                <h3>Add approved line</h3>
              </div>
            </div>

            <form class="budget-form" [formGroup]="budgetForm" (ngSubmit)="saveBudgetItem()">
              <label>
                <span>Office / secretariat</span>
                <input type="text" formControlName="officeTitle" />
              </label>

              <label>
                <span>Budget title</span>
                <input type="text" formControlName="budgetTitle" />
              </label>

              <label>
                <span>Academic year</span>
                <input type="text" formControlName="academicYear" />
              </label>

              <label>
                <span>Term label</span>
                <input type="text" formControlName="termLabel" />
              </label>

              <label>
                <span>Semester scope</span>
                <input type="text" formControlName="semesterScope" />
              </label>

              <label>
                <span>Section / event</span>
                <input type="text" formControlName="sectionName" />
              </label>

              <label>
                <span>Item</span>
                <input type="text" formControlName="itemName" />
              </label>

              <label>
                <span>Semester label</span>
                <select formControlName="semesterLabel">
                  <option value="Both semesters">Both semesters</option>
                  <option value="Semester One">Semester One</option>
                  <option value="Semester Two">Semester Two</option>
                </select>
              </label>

              <label>
                <span>Quantity</span>
                <input type="number" formControlName="quantity" min="0" />
              </label>

              <label>
                <span>Unit cost</span>
                <input type="number" formControlName="unitCost" min="0" />
              </label>

              <label>
                <span>Total amount</span>
                <input type="number" formControlName="totalAmount" min="0" />
              </label>

              <button type="submit" [disabled]="isSaving()">Save Budget Line</button>
            </form>
          </section>
        </section>

        <section id="variance" class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Variance readiness</p>
              <h3>How this officer view supports requisitions</h3>
            </div>
          </div>
          <div class="variance-grid">
            <article>
              <strong>Approved baseline</strong>
              <span>Requester screens now draw from the officer-managed budget items.</span>
            </article>
            <article>
              <strong>Unbudgeted control</strong>
              <span>Items outside the baseline must be marked and justified by the requester.</span>
            </article>
            <article>
              <strong>Import next</strong>
              <span>The manual line form is the foundation before full Excel import automation.</span>
            </article>
          </div>
        </section>
      </section>
    </main>
  `,
  styles: `
    .budget-shell {
      background: #eef2f6;
      color: #101828;
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      min-height: 100dvh;
    }

    .sidebar {
      background: #051b2c;
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

    .logo,
    .avatar {
      background: #ffffff;
      border-radius: 12px;
      color: #051b2c;
      display: grid;
      font-weight: 900;
      height: 48px;
      object-fit: contain;
      place-items: center;
      width: 48px;
    }

    .logo {
      padding: 4px;
    }

    .eyebrow {
      color: #667085;
      font-size: 0.72rem;
      font-weight: 900;
      letter-spacing: 0;
      margin: 0 0 5px;
      text-transform: uppercase;
    }

    .sidebar .eyebrow {
      color: #f7c948;
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      font-size: 1.3rem;
    }

    h2 {
      font-size: 1.35rem;
    }

    h3 {
      font-size: 1rem;
    }

    nav {
      display: grid;
      gap: 8px;
    }

    .nav-link {
      border-radius: 8px;
      color: #d5e2ee;
      font-weight: 800;
      padding: 11px 12px;
      text-decoration: none;
    }

    .nav-link:hover,
    .nav-link:focus-visible,
    .nav-link.active {
      background: rgb(255 255 255 / 12%);
      color: #ffffff;
      outline: none;
    }

    .logout,
    form button {
      background: #f7c948;
      border: 0;
      border-radius: 8px;
      color: #111827;
      cursor: pointer;
      font: inherit;
      font-weight: 900;
      min-height: 40px;
      padding: 0 14px;
    }

    .logout {
      margin-top: auto;
    }

    .topbar,
    .panel,
    .metrics article {
      background: #ffffff;
      border: 1px solid #e4e7ec;
      border-radius: 12px;
      box-shadow: 0 12px 24px rgb(16 24 40 / 4%);
    }

    .topbar {
      align-items: center;
      display: flex;
      gap: 16px;
      justify-content: space-between;
      padding: 18px;
    }

    .topbar span,
    .metrics span,
    .variance-grid span {
      color: #667085;
      font-size: 0.82rem;
    }

    .metrics {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .metrics article {
      display: grid;
      gap: 7px;
      padding: 16px;
    }

    .metrics strong {
      font-size: 1.35rem;
    }

    .grid {
      align-items: start;
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr);
    }

    .panel {
      display: grid;
      gap: 14px;
      padding: 18px;
      min-width: 0;
    }

    .section-heading {
      align-items: center;
      display: flex;
      gap: 12px;
      justify-content: space-between;
    }

    .section-heading > span {
      background: #ecfdf3;
      border-radius: 999px;
      color: #067647;
      font-size: 0.78rem;
      font-weight: 900;
      padding: 6px 10px;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      border-collapse: collapse;
      min-width: 760px;
      width: 100%;
    }

    th,
    td {
      border-bottom: 1px solid #edf0f4;
      font-size: 0.82rem;
      padding: 10px;
      text-align: left;
      vertical-align: top;
    }

    th {
      color: #344054;
      font-size: 0.74rem;
      text-transform: uppercase;
    }

    .number {
      text-align: right;
      white-space: nowrap;
    }

    .budget-form {
      display: grid;
      gap: 10px;
    }

    label {
      display: grid;
      gap: 6px;
    }

    label span {
      color: #344054;
      font-size: 0.78rem;
      font-weight: 900;
    }

    input,
    select {
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      color: #101828;
      font: inherit;
      min-height: 40px;
      padding: 8px 10px;
      width: 100%;
    }

    .alert {
      border-radius: 8px;
      font-weight: 800;
      margin: 0;
      padding: 12px 14px;
    }

    .alert.error {
      background: #fff1f3;
      color: #b42318;
    }

    .alert.success {
      background: #ecfdf3;
      color: #067647;
    }

    .empty-state {
      border: 1px dashed #d0d5dd;
      border-radius: 10px;
      color: #667085;
      padding: 24px;
      text-align: center;
    }

    .variance-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .variance-grid article {
      background: #f8fafc;
      border: 1px solid #edf0f4;
      border-radius: 10px;
      display: grid;
      gap: 6px;
      padding: 14px;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    @media (max-width: 1080px) {
      .budget-shell,
      .grid,
      .metrics,
      .variance-grid {
        grid-template-columns: 1fr;
      }

      .sidebar {
        flex-direction: row;
        flex-wrap: wrap;
      }

      nav {
        display: flex;
        flex-wrap: wrap;
      }

      .logout {
        margin-left: auto;
        margin-top: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BudgetDashboard implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly budgetService = inject(BudgetService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  protected readonly budgetItems = signal<BudgetItem[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly userName = computed(() => this.authService.currentUser()?.fullName ?? 'Budget Officer');
  protected readonly userInitial = computed(() => this.userName().slice(0, 1));
  protected readonly officeTitle = computed(() => this.authService.currentUser()?.officeTitle ?? 'Budget Office');
  protected readonly campusName = computed(() => this.authService.currentUser()?.campus.name ?? 'Campus');
  protected readonly totalBudget = computed(() =>
    this.budgetItems().reduce((total, item) => total + item.totalAmount, 0)
  );
  protected readonly officeCount = computed(() => new Set(this.budgetItems().map((item) => item.officeTitle)).size);
  protected readonly metrics = computed<BudgetMetric[]>(() => [
    {
      label: 'Approved Lines',
      value: String(this.budgetItems().length),
      helper: 'Council budget items in the system'
    },
    {
      label: 'Baseline Value',
      value: this.formatMoney(this.totalBudget()),
      helper: 'Total approved amount captured'
    },
    {
      label: 'Offices Covered',
      value: String(this.officeCount()),
      helper: 'Secretariats with budget lines'
    }
  ]);

  protected readonly budgetForm = this.formBuilder.group({
    officeTitle: this.formBuilder.control('Secretary for Community and Cultural Affairs', {
      validators: [Validators.required]
    }),
    budgetTitle: this.formBuilder.control('Secretariat for Community and Cultural Affairs Budget', {
      validators: [Validators.required]
    }),
    academicYear: this.formBuilder.control('2025/2026', { validators: [Validators.required] }),
    termLabel: this.formBuilder.control('Term of Office', { validators: [Validators.required] }),
    semesterScope: this.formBuilder.control('Semester One and Semester Two', { validators: [Validators.required] }),
    sectionName: this.formBuilder.control('', { validators: [Validators.required] }),
    itemName: this.formBuilder.control('', { validators: [Validators.required] }),
    quantity: this.formBuilder.control<number | null>(null),
    unitCost: this.formBuilder.control<number | null>(null),
    totalAmount: this.formBuilder.control<number | null>(null, { validators: [Validators.required] }),
    semesterLabel: this.formBuilder.control('Both semesters', { validators: [Validators.required] })
  });

  ngOnInit(): void {
    this.loadBudgetItems();
  }

  protected saveBudgetItem(): void {
    this.budgetForm.markAllAsTouched();

    if (this.budgetForm.invalid) {
      this.errorMessage.set('Fill in the office, budget, section, item, and total amount.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.budgetService.createBudgetItem(this.budgetForm.getRawValue() as BudgetItemRequest).subscribe({
      next: (item) => {
        this.upsertBudgetItem(item);
        this.successMessage.set(`${item.itemName} saved to the approved baseline.`);
        this.budgetForm.patchValue({
          sectionName: '',
          itemName: '',
          quantity: null,
          unitCost: null,
          totalAmount: null,
          semesterLabel: 'Both semesters'
        });
        this.isSaving.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.readHttpError(error));
        this.isSaving.set(false);
      }
    });
  }

  protected formatMoney(amount: number): string {
    return `UGX ${amount.toLocaleString('en-US')}`;
  }

  protected logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }

  private loadBudgetItems(): void {
    this.isLoading.set(true);

    this.budgetService.getBudgetItems().subscribe({
      next: (items) => {
        this.budgetItems.set(items);
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.readHttpError(error));
        this.isLoading.set(false);
      }
    });
  }

  private upsertBudgetItem(item: BudgetItem): void {
    this.budgetItems.update((items) => {
      const index = items.findIndex((existingItem) => existingItem.id === item.id);

      if (index === -1) {
        return [...items, item];
      }

      return items.map((existingItem) => (existingItem.id === item.id ? item : existingItem));
    });
  }

  private readHttpError(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Backend is not reachable. Start the backend server on port 5050.';
    }

    return typeof error.error?.message === 'string' ? error.error.message : 'Budget operation failed.';
  }
}
