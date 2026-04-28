import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule],
  template: `
    <main class="password-page">
      <section class="password-card" aria-labelledby="password-title">
        <p class="eyebrow">Account Security</p>
        <h1 id="password-title">Create a new password</h1>
        <p class="copy">Use a strong password before continuing to UMUSU RMS.</p>

        <form [formGroup]="passwordForm" (ngSubmit)="submit()" class="password-form">
          <label>
            <span>Current password</span>
            <input [type]="currentType()" formControlName="currentPassword" autocomplete="current-password" />
          </label>

          <label>
            <span>New password</span>
            <input [type]="newType()" formControlName="newPassword" autocomplete="new-password" />
          </label>

          <label>
            <span>Confirm new password</span>
            <input [type]="newType()" formControlName="confirmPassword" autocomplete="new-password" />
          </label>

          <button type="button" class="ghost-button" (click)="togglePasswordVisibility()">
            {{ passwordVisible() ? 'Hide passwords' : 'Show passwords' }}
          </button>

          @if (errorMessage()) {
            <p class="form-error" role="alert">{{ errorMessage() }}</p>
          }

          <button type="submit" class="submit-button" [disabled]="isSubmitting()">
            {{ isSubmitting() ? 'Updating...' : 'Update password' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: `
    .password-page {
      align-items: center;
      background: #f2f4f7;
      display: grid;
      min-height: 100dvh;
      padding: 18px;
    }

    .password-card {
      background: #ffffff;
      border: 1px solid #e4e7ec;
      border-radius: 14px;
      box-shadow: 0 18px 48px rgb(16 24 40 / 8%);
      display: grid;
      gap: 14px;
      margin-inline: auto;
      max-width: 460px;
      padding: clamp(22px, 4vw, 34px);
      width: 100%;
    }

    .eyebrow,
    h1,
    .copy,
    .form-error {
      margin: 0;
    }

    .eyebrow {
      color: #667085;
      font-size: 0.72rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    h1 {
      color: #101828;
      font-size: 1.55rem;
    }

    .copy {
      color: #667085;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .password-form {
      display: grid;
      gap: 13px;
    }

    label {
      color: #344054;
      display: grid;
      font-size: 0.82rem;
      font-weight: 900;
      gap: 7px;
    }

    input {
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      font: inherit;
      min-height: 42px;
      padding: 0 12px;
    }

    input:focus,
    button:focus-visible {
      box-shadow: 0 0 0 4px rgb(1 6 45 / 14%);
      outline: 2px solid transparent;
    }

    .form-error {
      background: #fff1f3;
      border: 1px solid #ffd3dc;
      border-radius: 8px;
      color: #b42318;
      font-size: 0.8rem;
      font-weight: 800;
      padding: 10px 12px;
    }

    .submit-button,
    .ghost-button {
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
      font-size: 0.84rem;
      font-weight: 900;
      min-height: 42px;
    }

    .submit-button {
      background: #01062d;
      border: 0;
      color: #ffffff;
    }

    .ghost-button {
      background: #ffffff;
      border: 1px solid #d0d5dd;
      color: #344054;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChangePassword {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly errorMessage = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly passwordVisible = signal(false);
  protected readonly currentType = computed(() => (this.passwordVisible() ? 'text' : 'password'));
  protected readonly newType = computed(() => (this.passwordVisible() ? 'text' : 'password'));

  protected readonly passwordForm = new FormGroup({
    currentPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(strongPasswordPattern)]
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((value) => !value);
  }

  protected submit(): void {
    this.passwordForm.markAllAsTouched();

    if (this.passwordForm.invalid || this.isSubmitting()) {
      this.errorMessage.set('Password must include uppercase, lowercase, number, symbol, and 8+ characters.');
      return;
    }

    const formValue = this.passwordForm.getRawValue();

    if (formValue.newPassword !== formValue.confirmPassword) {
      this.errorMessage.set('New password and confirmation do not match.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    this.authService.changePassword(formValue.currentPassword, formValue.newPassword).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        void this.router.navigateByUrl(this.authService.defaultRoute());
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(error.error?.message || 'Could not update password.');
      }
    });
  }
}
