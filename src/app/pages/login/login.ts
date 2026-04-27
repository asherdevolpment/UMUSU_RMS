import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly errorMessage = signal('');
  protected readonly isSubmitting = signal(false);

  protected readonly loginForm = new FormGroup({
    email: new FormControl('admin@umusu.ac.ug', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('Admin@123', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

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
        void this.router.navigateByUrl('/admin');
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting.set(false);

        if (error.status === 0) {
          this.errorMessage.set('Backend is not running. Start the backend server first.');
          return;
        }

        this.errorMessage.set('Login failed. Check your email and password.');
      }
    });
  }
}
