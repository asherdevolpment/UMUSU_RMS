import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

const umuEmailPattern = /^[^\s@]+@(?:[a-z0-9-]+\.)*umu\.ac\.ug$/i;

@Component({
  selector: 'app-login',
  imports: [NgOptimizedImage, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly errorMessage = signal(
    this.route.snapshot.queryParamMap.get('expired')
      ? 'Your session has expired. Please sign in again.'
      : ''
  );
  protected readonly isSubmitting = signal(false);
  protected readonly allowedDomain = '@umu.ac.ug';
  protected readonly passwordVisible = signal(false);
  protected readonly passwordInputType = computed(() => (this.passwordVisible() ? 'text' : 'password'));

  protected readonly loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.pattern(umuEmailPattern)]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((isVisible) => !isVisible);
  }

  protected submit(): void {
    if (this.loginForm.invalid || this.isSubmitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.authService.login(email, password).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        void this.router.navigateByUrl(this.authService.defaultRoute());
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting.set(false);

        if (error.status === 0) {
          this.errorMessage.set('Backend is not reachable. Start the backend server on port 5050.');
          return;
        }

        this.errorMessage.set(error.error?.message || 'Login failed. Check your email and password.');
      }
    });
  }
}
