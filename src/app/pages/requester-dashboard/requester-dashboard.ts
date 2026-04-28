import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import {
  BudgetItem,
  Requisition,
  RequisitionDetails,
  RequisitionDocument,
  RequisitionEvent,
  RequisitionRequest,
  RequesterService
} from '../../services/requester.service';

interface RequestCategory {
  key: string;
  title: string;
  description: string;
  iconPath: string;
  examples: string;
}

interface SummaryCard {
  label: string;
  value: number;
  tone: 'submitted' | 'pending' | 'approved' | 'draft';
  iconPath: string;
}

interface RequirementItem {
  label: string;
  value: string;
}

interface RequisitionFormValue {
  category: string;
  subcategory: string;
  title: string;
  purpose: string;
  amount: number | null;
  neededDate: string | null;
  budgetItemId: number | null;
  budgetLine: string;
  plannedBudget: number | null;
  lineItems: string;
  isUnbudgeted: boolean;
  unbudgetedJustification: string;
  activityDate: string | null;
  venue: string;
  expectedParticipants: number | null;
  activityLead: string;
  expenseType: string;
  urgencyReason: string;
  accountabilityDate: string | null;
  assetType: string;
  quantity: number | null;
  usageDate: string | null;
  returnDate: string | null;
  destination: string;
  responsiblePerson: string;
}

type RequesterSection = 'dashboard' | 'create' | 'requisitions' | 'accountability';

interface BudgetPerformanceLine {
  name: string;
  allocated: number;
  requested: number;
  approved: number;
  pending: number;
  unbudgeted: number;
}

interface StatusSegment {
  label: string;
  value: number;
  color: string;
  percent: number;
}

@Component({
  selector: 'app-requester-dashboard',
  imports: [NgOptimizedImage, ReactiveFormsModule],
  templateUrl: './requester-dashboard.html',
  styleUrl: './requester-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RequesterDashboard implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly requesterService = inject(RequesterService);
  private readonly router = inject(Router);
  private readonly requestTitle = viewChild<ElementRef<HTMLInputElement>>('requestTitle');

  protected readonly currentUser = this.authService.currentUser;
  protected readonly activeSection = signal<RequesterSection>('dashboard');
  protected readonly selectedCategory = signal('activity');
  protected readonly requisitions = signal<Requisition[]>([]);
  protected readonly selectedRequisition = signal<Requisition | null>(null);
  protected readonly requisitionEvents = signal<RequisitionEvent[]>([]);
  protected readonly requisitionDocuments = signal<RequisitionDocument[]>([]);
  protected readonly budgetItems = signal<BudgetItem[]>([]);
  protected readonly budgetFile = signal<File | null>(null);
  protected readonly supportingFiles = signal<File[]>([]);
  protected readonly editingRequisitionId = signal<number | null>(null);
  protected readonly isReviewOpen = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly userInitial = computed(() => this.currentUser()?.fullName.slice(0, 1) ?? 'R');
  protected readonly userName = computed(() => this.currentUser()?.fullName ?? 'Requester');
  protected readonly campusName = computed(() => this.currentUser()?.campus.name ?? 'Campus');
  protected readonly roleName = computed(() => this.currentUser()?.role.name ?? 'Requester');
  protected readonly officeTitle = computed(() => this.currentUser()?.officeTitle || 'Requester');
  protected readonly userEmail = computed(() => this.currentUser()?.email ?? 'No email available');
  protected readonly accountStatus = computed(() => (this.currentUser()?.isActive ? 'Active' : 'Inactive'));
  protected readonly pageTitle = computed(() => {
    switch (this.activeSection()) {
      case 'create':
        return 'Create requisition';
      case 'requisitions':
        return 'Track my requisitions';
      case 'accountability':
        return 'Budget performance';
      default:
        return 'My requisition workspace';
    }
  });

  protected readonly requisitionForm = this.formBuilder.group({
    category: this.formBuilder.control('activity', { validators: [Validators.required] }),
    subcategory: this.formBuilder.control(''),
    title: this.formBuilder.control('', { validators: [Validators.required, Validators.minLength(4)] }),
    purpose: this.formBuilder.control('', { validators: [Validators.required, Validators.minLength(10)] }),
    amount: this.formBuilder.control<number | null>(null),
    neededDate: this.formBuilder.control<string | null>(null),
    budgetItemId: this.formBuilder.control<number | null>(null),
    budgetLine: this.formBuilder.control(''),
    plannedBudget: this.formBuilder.control<number | null>(null),
    lineItems: this.formBuilder.control(''),
    isUnbudgeted: this.formBuilder.control(false),
    unbudgetedJustification: this.formBuilder.control(''),
    activityDate: this.formBuilder.control<string | null>(null),
    venue: this.formBuilder.control(''),
    expectedParticipants: this.formBuilder.control<number | null>(null),
    activityLead: this.formBuilder.control(''),
    expenseType: this.formBuilder.control(''),
    urgencyReason: this.formBuilder.control(''),
    accountabilityDate: this.formBuilder.control<string | null>(null),
    assetType: this.formBuilder.control('Vehicle'),
    quantity: this.formBuilder.control<number | null>(1),
    usageDate: this.formBuilder.control<string | null>(null),
    returnDate: this.formBuilder.control<string | null>(null),
    destination: this.formBuilder.control(''),
    responsiblePerson: this.formBuilder.control('')
  });

  protected readonly summaryCards = computed<SummaryCard[]>(() => [
    {
      label: 'Total Requests',
      value: this.requisitions().length,
      tone: 'submitted',
      iconPath: 'M5 21V3h14v18H5Zm3-13h8V6H8v2Zm0 4h8v-2H8v2Zm0 4h5v-2H8v2Z'
    },
    {
      label: 'Pending Review',
      value: this.requisitions().filter((item) => item.status === 'Submitted').length,
      tone: 'pending',
      iconPath: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm1-10V7h-2v7h6v-2h-4Z'
    },
    {
      label: 'Approved',
      value: this.requisitions().filter((item) => item.status === 'Approved' || item.status === 'Pending Payment').length,
      tone: 'approved',
      iconPath: 'm10 15.2 7.6-7.6L19 9l-9 9-5-5 1.4-1.4 3.6 3.6Z'
    },
    {
      label: 'Drafts',
      value: this.requisitions().filter((item) => item.status === 'Draft' || item.status === 'Returned').length,
      tone: 'draft',
      iconPath: 'M4 20h16v-2H4v2ZM6 4v10h12V4H6Zm2 2h8v6H8V6Z'
    }
  ]);

  protected readonly requestCategories: RequestCategory[] = [
    {
      key: 'activity',
      title: 'Activity requisition',
      description: 'For official student activities, events, welfare programs, meetings, and approved union work.',
      examples: 'Events, facilitation, refreshments',
      iconPath: 'M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm11 8H6v10h12V10ZM6 8h12V6H6v2Zm2 5h3v3H8v-3Z'
    },
    {
      key: 'petty-cash',
      title: 'Petty cash',
      description: 'For small operational expenses that need quick approval and clear accountability.',
      examples: 'Small purchases, local errands',
      iconPath: 'M3 6h18v12H3V6Zm2 3v6h14V9H5Zm7 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'
    },
    {
      key: 'asset',
      title: 'General asset',
      description: 'For shared university assets managed through responsible offices such as Estates.',
      examples: 'Vehicles, chairs, tents, sports equipment',
      iconPath: 'M4 7h9l2 3h5v9H4V7Zm3 8.5A1.5 1.5 0 1 0 7 12a1.5 1.5 0 0 0 0 3.5Zm10 0a1.5 1.5 0 1 0 0-3.5 1.5 1.5 0 0 0 0 3.5ZM6 10h6.7l-1-1.5H6V10Z'
    }
  ];

  protected readonly selectedCategoryInfo = computed(
    () => this.requestCategories.find((category) => category.key === this.selectedCategory()) ?? this.requestCategories[0]
  );

  protected readonly subcategoryPlaceholder = computed(() => {
    switch (this.selectedCategory()) {
      case 'asset':
        return 'Example: Vehicle, chairs, tents, sports equipment';
      case 'petty-cash':
        return 'Example: Stationery, transport refund, small purchase';
      default:
        return 'Example: Event, debate, meeting, welfare activity';
    }
  });

  protected readonly amountLabel = computed(() =>
    this.selectedCategory() === 'asset' ? 'Estimated cost' : 'Amount needed'
  );
  protected readonly needsBudgetSpreadsheet = computed(() =>
    ['activity', 'petty-cash'].includes(this.selectedCategory())
  );
  protected readonly needsSupportingPdf = computed(() => this.selectedCategory() === 'petty-cash');
  protected readonly existingBudgetDocument = computed(() =>
    this.requisitionDocuments().some((document) => document.documentType === 'Budget Spreadsheet')
  );
  protected readonly existingSupportingPdf = computed(() =>
    this.requisitionDocuments().some((document) => document.documentType === 'Supporting PDF')
  );
  protected readonly selectedReviewRows = computed<RequirementItem[]>(() => {
    this.isReviewOpen();
    const value = this.requisitionForm.getRawValue();

    return [
      { label: 'Category', value: this.categoryLabel(value.category) },
      { label: 'Title', value: value.title || 'Not set' },
      { label: 'Budget line', value: value.budgetLine || value.subcategory || 'Not set' },
      { label: 'Requested amount', value: this.formatMoney(value.amount) },
      { label: 'Known line budget', value: this.formatMoney(value.plannedBudget) },
      { label: 'Needed date', value: this.formatDate(value.neededDate) },
      { label: 'Budget spreadsheet', value: this.budgetFile()?.name || (this.existingBudgetDocument() ? 'Already uploaded' : 'Not attached') },
      { label: 'Supporting PDFs', value: `${this.supportingFiles().length} selected${this.existingSupportingPdf() ? ' plus existing files' : ''}` },
      { label: 'Budget status', value: value.isUnbudgeted ? `Unbudgeted: ${value.unbudgetedJustification || 'No justification yet'}` : 'Matched to approved council budget' }
    ];
  });
  protected readonly budgetLines = computed<BudgetPerformanceLine[]>(() => {
    const lines = new Map<string, BudgetPerformanceLine>();

    for (const item of this.budgetItems()) {
      const name = `${item.sectionName}: ${item.itemName}`;
      lines.set(name, {
        name,
        allocated: item.totalAmount,
        requested: 0,
        approved: 0,
        pending: 0,
        unbudgeted: 0
      });
    }

    for (const requisition of this.requisitions()) {
      const name = requisition.details.budgetLine || requisition.subcategory || this.categoryLabel(requisition.category);
      const amount = requisition.amount ?? 0;
      const plannedBudget = requisition.details.plannedBudget ?? 0;
      const existing = lines.get(name) ?? {
        name,
        allocated: 0,
        requested: 0,
        approved: 0,
        pending: 0,
        unbudgeted: 0
      };

      existing.allocated = Math.max(existing.allocated, plannedBudget);
      existing.requested += amount;

      if (requisition.status === 'Approved' || requisition.status === 'Pending Payment') {
        existing.approved += amount;
      }

      if (requisition.status === 'Submitted') {
        existing.pending += amount;
      }

      if ((plannedBudget === 0 || requisition.details.isUnbudgeted) && amount > 0) {
        existing.unbudgeted += amount;
      }

      lines.set(name, existing);
    }

    return Array.from(lines.values()).sort((first, second) => second.requested - first.requested);
  });
  protected readonly totalKnownBudget = computed(() =>
    this.budgetLines().reduce((total, line) => total + line.allocated, 0)
  );
  protected readonly totalRequestedBudget = computed(() =>
    this.budgetLines().reduce((total, line) => total + line.requested, 0)
  );
  protected readonly totalApprovedBudget = computed(() =>
    this.budgetLines().reduce((total, line) => total + line.approved, 0)
  );
  protected readonly totalUnbudgeted = computed(() =>
    this.budgetLines().reduce((total, line) => total + line.unbudgeted, 0)
  );
  protected readonly statusSegments = computed<StatusSegment[]>(() => {
    const total = Math.max(this.requisitions().length, 1);
    const segments = [
      { label: 'Draft', value: this.requisitions().filter((item) => item.status === 'Draft').length, color: '#667085' },
      { label: 'Submitted', value: this.requisitions().filter((item) => item.status === 'Submitted').length, color: '#b54708' },
      { label: 'Approved', value: this.requisitions().filter((item) => item.status === 'Approved' || item.status === 'Pending Payment').length, color: '#067647' },
      { label: 'Returned', value: this.requisitions().filter((item) => item.status === 'Returned').length, color: '#b42318' }
    ];

    return segments.map((segment) => ({
      ...segment,
      percent: Math.round((segment.value / total) * 100)
    }));
  });
  protected readonly statusChartBackground = computed(() => {
    let cursor = 0;
    const stops = this.statusSegments()
      .filter((segment) => segment.value > 0)
      .map((segment) => {
        const start = cursor;
        cursor += segment.percent;
        return `${segment.color} ${start}% ${cursor}%`;
      });

    return `conic-gradient(${stops.length ? stops.join(', ') : '#e4e7ec 0% 100%'})`;
  });

  protected readonly purposePlaceholder = computed(() => {
    switch (this.selectedCategory()) {
      case 'asset':
        return 'State the asset needed, date, destination or venue, quantity, and responsible person.';
      case 'petty-cash':
        return 'Explain the small expense, why it is urgent, and how accountability will be submitted.';
      default:
        return 'Explain the activity, expected participants, benefit to students, and supporting budget details.';
    }
  });

  protected readonly requesterDetails = computed<RequirementItem[]>(() => [
    { label: 'Full name', value: this.userName() },
    { label: 'Email address', value: this.userEmail() },
    { label: 'Campus', value: this.campusName() },
    { label: 'Role', value: this.roleName() },
    { label: 'Designation', value: this.officeTitle() },
    { label: 'Account status', value: this.accountStatus() }
  ]);
  protected readonly selectedDetailRows = computed<RequirementItem[]>(() => {
    const requisition = this.selectedRequisition();

    if (!requisition) {
      return [];
    }

    const details = requisition.details;

    if (requisition.category === 'activity') {
      return [
        { label: 'Budget line', value: details.budgetLine || requisition.subcategory || 'Not set' },
        { label: 'Line budget', value: this.formatMoney(details.plannedBudget ?? null) },
        { label: 'Budget status', value: details.isUnbudgeted ? `Unbudgeted: ${details.unbudgetedJustification || 'Accepted need'}` : 'Approved council budget' },
        { label: 'Budget items', value: details.lineItems || 'Not set' },
        { label: 'Activity date', value: details.activityDate || 'Not set' },
        { label: 'Venue', value: details.venue || 'Not set' },
        { label: 'Participants', value: String(details.expectedParticipants ?? 'Not set') },
        { label: 'Activity lead', value: details.activityLead || 'Not set' }
      ];
    }

    if (requisition.category === 'petty-cash') {
      return [
        { label: 'Budget line', value: details.budgetLine || requisition.subcategory || 'Not set' },
        { label: 'Line budget', value: this.formatMoney(details.plannedBudget ?? null) },
        { label: 'Budget status', value: details.isUnbudgeted ? `Unbudgeted: ${details.unbudgetedJustification || 'Accepted need'}` : 'Approved council budget' },
        { label: 'Budget items', value: details.lineItems || 'Not set' },
        { label: 'Expense type', value: details.expenseType || 'Not set' },
        { label: 'Accountability date', value: details.accountabilityDate || 'Not set' },
        { label: 'Urgency', value: details.urgencyReason || 'Not set' }
      ];
    }

    return [
      { label: 'Budget line', value: details.budgetLine || requisition.subcategory || 'Not set' },
      { label: 'Line budget', value: this.formatMoney(details.plannedBudget ?? null) },
      { label: 'Budget status', value: details.isUnbudgeted ? `Unbudgeted: ${details.unbudgetedJustification || 'Accepted need'}` : 'Approved council budget' },
      { label: 'Budget items', value: details.lineItems || 'Not set' },
      { label: 'Asset type', value: details.assetType || 'Not set' },
      { label: 'Quantity', value: String(details.quantity ?? 'Not set') },
      { label: 'Usage date', value: details.usageDate || 'Not set' },
      { label: 'Return date', value: details.returnDate || 'Not set' },
      { label: 'Destination', value: details.destination || 'Not set' },
      { label: 'Responsible person', value: details.responsiblePerson || 'Not set' }
    ];
  });

  ngOnInit(): void {
    this.loadRequisitions();
    this.loadBudgetItems();
  }

  protected selectCategory(categoryKey: string): void {
    this.clearMessages();
    this.selectedCategory.set(categoryKey);
    this.requisitionForm.controls.category.setValue(categoryKey);
  }

  protected openSection(section: RequesterSection): void {
    this.activeSection.set(section);
    this.isReviewOpen.set(false);
    this.clearMessages();
  }

  protected saveDraft(): void {
    this.saveRequisition(false);
  }

  protected submitRequisition(): void {
    this.requisitionForm.markAllAsTouched();

    if (this.requisitionForm.invalid) {
      this.errorMessage.set('Enter a request title and purpose before submitting.');
      return;
    }

    if (!this.hasRequiredDocumentsForSubmit()) {
      return;
    }

    this.isReviewOpen.set(true);
    this.clearMessages();
  }

  protected confirmReviewedSubmit(): void {
    this.isReviewOpen.set(false);
    this.saveRequisition(true);
  }

  protected closeReview(): void {
    this.isReviewOpen.set(false);
  }

  protected focusRequestForm(): void {
    this.clearMessages();
    this.activeSection.set('create');
    queueMicrotask(() => this.requestTitle()?.nativeElement.focus());
  }

  protected editRequisition(requisition: Requisition): void {
    this.activeSection.set('create');
    this.selectRequisition(requisition);
    this.editingRequisitionId.set(requisition.id);
    this.selectedCategory.set(requisition.category);
    this.requisitionForm.setValue({
      category: requisition.category,
      subcategory: requisition.subcategory ?? '',
      title: requisition.title,
      purpose: requisition.purpose,
      amount: requisition.amount,
      neededDate: requisition.neededDate,
      budgetItemId: requisition.details.budgetItemId ?? null,
      budgetLine: requisition.details.budgetLine ?? requisition.subcategory ?? '',
      plannedBudget: requisition.details.plannedBudget ?? null,
      lineItems: requisition.details.lineItems ?? '',
      isUnbudgeted: requisition.details.isUnbudgeted ?? false,
      unbudgetedJustification: requisition.details.unbudgetedJustification ?? '',
      activityDate: requisition.details.activityDate ?? null,
      venue: requisition.details.venue ?? '',
      expectedParticipants: requisition.details.expectedParticipants ?? null,
      activityLead: requisition.details.activityLead ?? '',
      expenseType: requisition.details.expenseType ?? '',
      urgencyReason: requisition.details.urgencyReason ?? '',
      accountabilityDate: requisition.details.accountabilityDate ?? null,
      assetType: requisition.details.assetType ?? 'Vehicle',
      quantity: requisition.details.quantity ?? 1,
      usageDate: requisition.details.usageDate ?? null,
      returnDate: requisition.details.returnDate ?? null,
      destination: requisition.details.destination ?? '',
      responsiblePerson: requisition.details.responsiblePerson ?? ''
    });
    this.clearMessages();
  }

  protected useAsTemplate(requisition: Requisition): void {
    this.activeSection.set('create');
    this.editingRequisitionId.set(null);
    this.isReviewOpen.set(false);
    this.selectedCategory.set(requisition.category);
    this.budgetFile.set(null);
    this.supportingFiles.set([]);
    this.requisitionForm.setValue({
      category: requisition.category,
      subcategory: requisition.subcategory ?? '',
      title: `${requisition.title} copy`,
      purpose: requisition.purpose,
      amount: requisition.amount,
      neededDate: null,
      budgetItemId: requisition.details.budgetItemId ?? null,
      budgetLine: requisition.details.budgetLine ?? requisition.subcategory ?? '',
      plannedBudget: requisition.details.plannedBudget ?? null,
      lineItems: requisition.details.lineItems ?? '',
      isUnbudgeted: requisition.details.isUnbudgeted ?? false,
      unbudgetedJustification: requisition.details.unbudgetedJustification ?? '',
      activityDate: null,
      venue: requisition.details.venue ?? '',
      expectedParticipants: requisition.details.expectedParticipants ?? null,
      activityLead: requisition.details.activityLead ?? '',
      expenseType: requisition.details.expenseType ?? '',
      urgencyReason: requisition.details.urgencyReason ?? '',
      accountabilityDate: null,
      assetType: requisition.details.assetType ?? 'Vehicle',
      quantity: requisition.details.quantity ?? 1,
      usageDate: null,
      returnDate: null,
      destination: requisition.details.destination ?? '',
      responsiblePerson: requisition.details.responsiblePerson ?? ''
    });
    this.successMessage.set('Template loaded. Review the dates, amount, and documents before saving.');
    this.errorMessage.set('');
  }

  protected cancelEdit(): void {
    this.editingRequisitionId.set(null);
    this.resetForm();
    this.clearMessages();
  }

  protected clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  protected budgetFileChanged(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.budgetFile.set(input.files?.[0] ?? null);
    this.clearMessages();
  }

  protected supportingFilesChanged(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.supportingFiles.set(Array.from(input.files ?? []));
    this.clearMessages();
  }

  protected budgetItemChanged(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const budgetItemId = select.value ? Number(select.value) : null;
    const item = this.budgetItems().find((budgetItem) => budgetItem.id === budgetItemId);

    this.requisitionForm.controls.budgetItemId.setValue(budgetItemId);

    if (!item) {
      return;
    }

    this.requisitionForm.patchValue({
      budgetLine: `${item.sectionName}: ${item.itemName}`,
      plannedBudget: item.totalAmount,
      lineItems: `${item.itemName}${item.quantity ? ` x ${item.quantity}` : ''}`,
      amount: item.totalAmount,
      isUnbudgeted: false,
      unbudgetedJustification: ''
    });
    this.clearMessages();
  }

  protected unbudgetedChanged(event: Event): void {
    const input = event.target as HTMLInputElement;
    const isUnbudgeted = input.checked;

    this.requisitionForm.controls.isUnbudgeted.setValue(isUnbudgeted);

    if (isUnbudgeted) {
      this.requisitionForm.patchValue({
        budgetItemId: null,
        plannedBudget: null
      });
    }
  }

  protected submitExisting(requisition: Requisition): void {
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.requesterService.submitRequisition(requisition.id).subscribe({
      next: (updatedRequisition) => {
        this.replaceRequisition(updatedRequisition);
        this.successMessage.set(`${updatedRequisition.referenceNo} submitted successfully.`);
        this.selectRequisition(updatedRequisition);
        this.activeSection.set('requisitions');
        this.resetForm();
        this.isSaving.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.readHttpError(error, 'Could not submit the requisition.'));
        this.isSaving.set(false);
      }
    });
  }

  protected selectRequisition(requisition: Requisition): void {
    this.selectedRequisition.set(requisition);
    this.requisitionEvents.set([]);
    this.requisitionDocuments.set([]);

    this.requesterService.getRequisitionEvents(requisition.id).subscribe({
      next: (events) => this.requisitionEvents.set(events),
      error: () => this.requisitionEvents.set([])
    });

    this.requesterService.getRequisitionDocuments(requisition.id).subscribe({
      next: (documents) => this.requisitionDocuments.set(documents),
      error: () => this.requisitionDocuments.set([])
    });
  }

  protected canEdit(requisition: Requisition): boolean {
    return requisition.status === 'Draft' || requisition.status === 'Returned';
  }

  protected categoryLabel(categoryKey: string): string {
    return this.requestCategories.find((category) => category.key === categoryKey)?.title ?? categoryKey;
  }

  protected budgetUsagePercent(line: BudgetPerformanceLine): number {
    if (line.allocated <= 0) {
      return line.requested > 0 ? 100 : 0;
    }

    return Math.min(100, Math.round((line.requested / line.allocated) * 100));
  }

  protected budgetUsageWidth(line: BudgetPerformanceLine): string {
    return `${this.budgetUsagePercent(line)}%`;
  }

  protected formatMoney(amount: number | null): string {
    if (amount === null) {
      return 'No amount';
    }

    return `UGX ${amount.toLocaleString('en-US')}`;
  }

  protected formatDate(value: string | null): string {
    if (!value) {
      return 'Not set';
    }

    return new Intl.DateTimeFormat('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(value));
  }

  protected formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }

  private loadRequisitions(): void {
    this.isLoading.set(true);

    this.requesterService.getRequisitions().subscribe({
      next: (requisitions) => {
        this.requisitions.set(requisitions);
        this.selectedRequisition.set(requisitions[0] ?? null);
        this.isLoading.set(false);

        if (requisitions[0]) {
          this.selectRequisition(requisitions[0]);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.readHttpError(error, 'Could not load requisitions.'));
        this.isLoading.set(false);
      }
    });
  }

  private loadBudgetItems(): void {
    this.requesterService.getBudgetItems().subscribe({
      next: (items) => this.budgetItems.set(items),
      error: () => this.budgetItems.set([])
    });
  }

  private saveRequisition(submit: boolean): void {
    this.requisitionForm.markAllAsTouched();

    if (this.requisitionForm.invalid) {
      this.errorMessage.set('Enter a request title and purpose before saving or submitting.');
      return;
    }

    if (submit && !this.hasRequiredDocumentsForSubmit()) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const formValue = this.requisitionForm.getRawValue();
    const editingId = this.editingRequisitionId();
    const payload: RequisitionRequest = {
      category: formValue.category,
      subcategory: formValue.subcategory,
      title: formValue.title,
      purpose: formValue.purpose,
      amount: formValue.amount,
      neededDate: formValue.neededDate,
      details: this.buildCategoryDetails(formValue),
      submit: false
    };

    const request = editingId
      ? this.requesterService.updateRequisition(editingId, {
          category: payload.category,
          subcategory: payload.subcategory,
          title: payload.title,
          purpose: payload.purpose,
          amount: payload.amount,
          neededDate: payload.neededDate,
          details: payload.details
        })
      : this.requesterService.createRequisition(payload);

    request.subscribe({
      next: (requisition) => {
        this.uploadSelectedDocuments(requisition, submit);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.readHttpError(error, 'Could not save the requisition.'));
        this.isSaving.set(false);
      }
    });
  }

  private buildCategoryDetails(formValue: RequisitionFormValue): RequisitionDetails {
    const budgetDetails = {
      budgetItemId: formValue.budgetItemId,
      budgetLine: formValue.budgetLine,
      plannedBudget: formValue.plannedBudget,
      lineItems: formValue.lineItems,
      isUnbudgeted: formValue.isUnbudgeted,
      unbudgetedJustification: formValue.unbudgetedJustification
    };

    if (formValue.category === 'activity') {
      return {
        ...budgetDetails,
        activityDate: formValue.activityDate,
        venue: formValue.venue,
        expectedParticipants: formValue.expectedParticipants,
        activityLead: formValue.activityLead
      };
    }

    if (formValue.category === 'petty-cash') {
      return {
        ...budgetDetails,
        expenseType: formValue.expenseType,
        urgencyReason: formValue.urgencyReason,
        accountabilityDate: formValue.accountabilityDate
      };
    }

    return {
      ...budgetDetails,
      assetType: formValue.assetType,
      quantity: formValue.quantity,
      usageDate: formValue.usageDate,
      returnDate: formValue.returnDate,
      destination: formValue.destination,
      responsiblePerson: formValue.responsiblePerson
    };
  }

  private hasRequiredDocumentsForSubmit(): boolean {
    const formValue = this.requisitionForm.getRawValue();
    const existingDocuments = this.editingRequisitionId() ? this.requisitionDocuments() : [];
    const hasExistingBudget = existingDocuments.some((document) => document.documentType === 'Budget Spreadsheet');
    const hasExistingPdf = existingDocuments.some((document) => document.documentType === 'Supporting PDF');

    if (!formValue.budgetItemId && !formValue.isUnbudgeted && !formValue.budgetLine) {
      this.errorMessage.set('Select an approved budget item or mark the request as unbudgeted with a justification.');
      return false;
    }

    if (formValue.isUnbudgeted && formValue.unbudgetedJustification.trim().length < 10) {
      this.errorMessage.set('Explain why this unbudgeted request is necessary before submitting.');
      return false;
    }

    if (this.needsBudgetSpreadsheet() && !this.budgetFile() && !hasExistingBudget) {
      this.errorMessage.set('Upload a budget spreadsheet before submitting this requisition.');
      return false;
    }

    if (this.needsSupportingPdf() && this.supportingFiles().length === 0 && !hasExistingPdf) {
      this.errorMessage.set('Upload at least one supporting PDF before submitting petty cash.');
      return false;
    }

    return true;
  }

  private uploadSelectedDocuments(requisition: Requisition, submit: boolean): void {
    const budgetFile = this.budgetFile();
    const supportingFiles = this.supportingFiles();

    if (!budgetFile && supportingFiles.length === 0) {
      this.finishRequisitionSave(requisition, submit);
      return;
    }

    this.requesterService.uploadDocuments(requisition.id, budgetFile, supportingFiles).subscribe({
      next: () => this.finishRequisitionSave(requisition, submit),
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.readHttpError(error, 'Could not upload requisition documents.'));
        this.isSaving.set(false);
      }
    });
  }

  private finishRequisitionSave(requisition: Requisition, submit: boolean): void {
    if (submit) {
      this.submitExisting(requisition);
      return;
    }

    this.upsertRequisition(requisition);
    this.successMessage.set(`${requisition.referenceNo} saved as a draft.`);
    this.selectRequisition(requisition);
    this.resetForm();
    this.activeSection.set('dashboard');
    this.isSaving.set(false);
  }

  private readHttpError(error: HttpErrorResponse, fallback: string): string {
    if (error.status === 0) {
      return 'Backend is not reachable. Start the backend server on port 5050.';
    }

    const message = typeof error.error?.message === 'string' ? error.error.message : fallback;
    const detail = typeof error.error?.detail === 'string' ? error.error.detail : '';

    return detail && detail !== message ? `${message}: ${detail}` : message;
  }

  private resetForm(): void {
    this.selectedCategory.set('activity');
    this.editingRequisitionId.set(null);
    this.isReviewOpen.set(false);
    this.budgetFile.set(null);
    this.supportingFiles.set([]);
    this.requisitionForm.reset({
      category: 'activity',
      subcategory: '',
      title: '',
      purpose: '',
      amount: null,
      neededDate: null,
      budgetItemId: null,
      budgetLine: '',
      plannedBudget: null,
      lineItems: '',
      isUnbudgeted: false,
      unbudgetedJustification: '',
      activityDate: null,
      venue: '',
      expectedParticipants: null,
      activityLead: '',
      expenseType: '',
      urgencyReason: '',
      accountabilityDate: null,
      assetType: 'Vehicle',
      quantity: 1,
      usageDate: null,
      returnDate: null,
      destination: '',
      responsiblePerson: ''
    });
  }

  private upsertRequisition(requisition: Requisition): void {
    const existing = this.requisitions();
    const index = existing.findIndex((item) => item.id === requisition.id);

    if (index === -1) {
      this.requisitions.set([requisition, ...existing]);
      return;
    }

    this.replaceRequisition(requisition);
  }

  private replaceRequisition(requisition: Requisition): void {
    this.requisitions.update((items) =>
      items.map((item) => (item.id === requisition.id ? requisition : item))
    );
  }
}
