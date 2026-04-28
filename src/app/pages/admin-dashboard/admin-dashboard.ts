import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AdminService, LoginAudit, RoleOfficeTitle } from '../../services/admin.service';
import { AuthService, Campus, CurrentUser, Role } from '../../services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  imports: [NgOptimizedImage, ReactiveFormsModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboard implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly users = signal<CurrentUser[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly campuses = signal<Campus[]>([]);
  protected readonly officeTitles = signal<RoleOfficeTitle[]>([]);
  protected readonly loginAudits = signal<LoginAudit[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isCreating = signal(false);
  protected readonly isManaging = signal(false);
  protected readonly loadError = signal('');
  protected readonly successMessage = signal('');
  protected readonly selectedRoleId = signal('');
  protected readonly editingRoleId = signal<number | null>(null);
  protected readonly editingCampusId = signal<number | null>(null);
  protected readonly editingOfficeTitleId = signal<number | null>(null);
  protected readonly passwordVisible = signal(false);
  protected readonly passwordInputType = computed(() => (this.passwordVisible() ? 'text' : 'password'));
  protected readonly activeSection = signal<
    'dashboard' | 'users' | 'roles' | 'campuses' | 'categories' | 'reports'
  >('dashboard');

  protected readonly officeOptions = computed(() => {
    const roleId = Number(this.selectedRoleId());
    const options = this.officeTitles()
      .filter((officeTitle) => officeTitle.roleId === roleId)
      .map((officeTitle) => officeTitle.title);

    return options.length > 0 ? options : ['General User'];
  });

  protected readonly totalUsers = computed(() => this.users().length);
  protected readonly activeUsers = computed(
    () => this.users().filter((user) => user.isActive).length
  );
  protected readonly campusCount = computed(() => this.campuses().length);
  protected readonly roleCount = computed(() => this.roles().length);
  protected readonly usersByRole = computed(() =>
    this.roles().map((role) => ({
      role,
      total: this.users().filter((user) => user.role.id === role.id).length
    }))
  );
  protected readonly usersByCampus = computed(() =>
    this.campuses().map((campus) => ({
      campus,
      total: this.users().filter((user) => user.campus.id === campus.id).length
    }))
  );
  protected readonly userInitial = computed(() => this.currentUser()?.fullName.slice(0, 1) ?? 'A');
  protected readonly currentUserName = computed(() => this.currentUser()?.fullName ?? 'Admin User');
  protected readonly currentUserId = computed(() => this.currentUser()?.id ?? 0);

  protected readonly createUserForm = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)]
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/)
      ]
    }),
    roleId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    campusId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    officeTitle: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((isVisible) => !isVisible);
  }

  protected readonly roleForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)]
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)]
    })
  });

  protected readonly campusForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)]
    }),
    isMain: new FormControl(false, {
      nonNullable: true
    })
  });

  protected readonly officeTitleForm = new FormGroup({
    roleId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)]
    })
  });

  ngOnInit(): void {
    this.loadDashboard();
  }

  protected createUser(): void {
    if (this.createUserForm.invalid || this.isCreating()) {
      this.createUserForm.markAllAsTouched();
      return;
    }

    const formValue = this.createUserForm.getRawValue();
    this.isCreating.set(true);
    this.loadError.set('');
    this.successMessage.set('');

    this.adminService
      .createUser({
        fullName: formValue.fullName,
        email: formValue.email,
        password: formValue.password,
        roleId: Number(formValue.roleId),
        campusId: Number(formValue.campusId),
        officeTitle: formValue.officeTitle
      })
      .subscribe({
        next: (user) => {
          this.users.update((users) => [user, ...users]);
          this.createUserForm.reset();
          this.setDefaultSelects(this.roles(), this.campuses());
          this.isCreating.set(false);
          this.successMessage.set('User created successfully.');
        },
        error: (error: HttpErrorResponse) => {
          this.isCreating.set(false);
          this.loadError.set(
            error.error?.message || 'Could not create user. Confirm the email is not already registered.'
          );
        }
      });
  }

  protected logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }

  protected showSection(
    section: 'dashboard' | 'users' | 'roles' | 'campuses' | 'categories' | 'reports'
  ): void {
    this.successMessage.set('');
    this.activeSection.set(section);
  }

  protected toggleUserStatus(user: CurrentUser): void {
    this.isManaging.set(true);
    this.loadError.set('');

    this.adminService.updateUserStatus(user, !user.isActive).subscribe({
      next: (updatedUser) => {
        this.users.update((users) =>
          users.map((existingUser) =>
            existingUser.id === updatedUser.id ? updatedUser : existingUser
          )
        );
        this.isManaging.set(false);
        this.successMessage.set(updatedUser.isActive ? 'User reactivated.' : 'User deactivated.');
      },
      error: () => {
        this.isManaging.set(false);
        this.loadError.set('Could not update user status.');
      }
    });
  }

  protected deleteUser(user: CurrentUser): void {
    this.isManaging.set(true);
    this.loadError.set('');

    this.adminService.deleteUser(user.id).subscribe({
      next: () => {
        this.users.update((users) => users.filter((existingUser) => existingUser.id !== user.id));
        this.isManaging.set(false);
        this.successMessage.set('User deleted.');
      },
      error: () => {
        this.isManaging.set(false);
        this.loadError.set('Could not delete user.');
      }
    });
  }

  protected resetUserPassword(user: CurrentUser): void {
    this.isManaging.set(true);
    this.loadError.set('');
    this.successMessage.set('');

    this.adminService.resetUserPassword(user.id).subscribe({
      next: (response) => {
        this.users.update((users) =>
          users.map((existingUser) =>
            existingUser.id === response.user.id ? response.user : existingUser
          )
        );
        this.isManaging.set(false);
        this.successMessage.set(
          `Temporary password for ${response.user.fullName}: ${response.temporaryPassword}`
        );
      },
      error: (error: HttpErrorResponse) => {
        this.isManaging.set(false);
        this.loadError.set(error.error?.message || 'Could not reset user password.');
      }
    });
  }

  protected saveRole(): void {
    if (this.roleForm.invalid || this.isManaging()) {
      this.roleForm.markAllAsTouched();
      return;
    }

    const payload = this.roleForm.getRawValue();
    const editingId = this.editingRoleId();
    this.isManaging.set(true);
    this.loadError.set('');

    const request = editingId
      ? this.adminService.updateRole(editingId, payload)
      : this.adminService.createRole(payload);

    request.subscribe({
      next: (role) => {
        this.roles.update((roles) =>
          editingId ? roles.map((item) => (item.id === role.id ? role : item)) : [...roles, role]
        );
        this.roleForm.reset();
        this.editingRoleId.set(null);
        this.isManaging.set(false);
        this.successMessage.set(editingId ? 'Role updated.' : 'Role created.');
      },
      error: () => {
        this.isManaging.set(false);
        this.loadError.set('Could not save role. Confirm it is not duplicated.');
      }
    });
  }

  protected editRole(role: Role): void {
    this.editingRoleId.set(role.id);
    this.roleForm.setValue({
      name: role.name,
      description: role.description ?? ''
    });
  }

  protected cancelRoleEdit(): void {
    this.editingRoleId.set(null);
    this.roleForm.reset();
  }

  protected deleteRole(role: Role): void {
    this.isManaging.set(true);
    this.loadError.set('');

    this.adminService.deleteRole(role.id).subscribe({
      next: () => {
        this.roles.update((roles) => roles.filter((item) => item.id !== role.id));
        this.officeTitles.update((titles) => titles.filter((title) => title.roleId !== role.id));
        this.isManaging.set(false);
        this.successMessage.set('Role deleted.');
      },
      error: () => {
        this.isManaging.set(false);
        this.loadError.set('Could not delete role. Remove assigned users first.');
      }
    });
  }

  protected saveCampus(): void {
    if (this.campusForm.invalid || this.isManaging()) {
      this.campusForm.markAllAsTouched();
      return;
    }

    const payload = this.campusForm.getRawValue();
    const editingId = this.editingCampusId();
    this.isManaging.set(true);
    this.loadError.set('');

    const request = editingId
      ? this.adminService.updateCampus(editingId, payload)
      : this.adminService.createCampus(payload);

    request.subscribe({
      next: (campus) => {
        this.campuses.update((campuses) => {
          const nextCampuses = editingId
            ? campuses.map((item) => (item.id === campus.id ? campus : item))
            : [...campuses, campus];

          return campus.isMain
            ? nextCampuses.map((item) => ({ ...item, isMain: item.id === campus.id }))
            : nextCampuses;
        });
        this.campusForm.reset({ name: '', isMain: false });
        this.editingCampusId.set(null);
        this.isManaging.set(false);
        this.successMessage.set(editingId ? 'Campus updated.' : 'Campus created.');
      },
      error: () => {
        this.isManaging.set(false);
        this.loadError.set('Could not save campus. Confirm it is not duplicated.');
      }
    });
  }

  protected editCampus(campus: Campus): void {
    this.editingCampusId.set(campus.id);
    this.campusForm.setValue({
      name: campus.name,
      isMain: campus.isMain
    });
  }

  protected cancelCampusEdit(): void {
    this.editingCampusId.set(null);
    this.campusForm.reset({ name: '', isMain: false });
  }

  protected deleteCampus(campus: Campus): void {
    this.isManaging.set(true);
    this.loadError.set('');

    this.adminService.deleteCampus(campus.id).subscribe({
      next: () => {
        this.campuses.update((campuses) => campuses.filter((item) => item.id !== campus.id));
        this.isManaging.set(false);
        this.successMessage.set('Campus deleted.');
      },
      error: () => {
        this.isManaging.set(false);
        this.loadError.set('Could not delete campus. Remove assigned users first.');
      }
    });
  }

  protected saveOfficeTitle(): void {
    if (this.officeTitleForm.invalid || this.isManaging()) {
      this.officeTitleForm.markAllAsTouched();
      return;
    }

    const formValue = this.officeTitleForm.getRawValue();
    const payload = {
      roleId: Number(formValue.roleId),
      title: formValue.title
    };
    const editingId = this.editingOfficeTitleId();
    this.isManaging.set(true);
    this.loadError.set('');

    const request = editingId
      ? this.adminService.updateRoleOfficeTitle(editingId, payload)
      : this.adminService.createRoleOfficeTitle(payload);

    request.subscribe({
      next: (officeTitle) => {
        this.officeTitles.update((titles) =>
          editingId
            ? titles.map((item) => (item.id === officeTitle.id ? officeTitle : item))
            : [...titles, officeTitle]
        );
        this.officeTitleForm.reset();
        this.setDefaultOfficeTitleRole();
        this.editingOfficeTitleId.set(null);
        this.isManaging.set(false);
        this.successMessage.set(editingId ? 'Role category updated.' : 'Role category created.');
      },
      error: () => {
        this.isManaging.set(false);
        this.loadError.set('Could not save role category. Confirm it is not duplicated.');
      }
    });
  }

  protected editOfficeTitle(officeTitle: RoleOfficeTitle): void {
    this.editingOfficeTitleId.set(officeTitle.id);
    this.officeTitleForm.setValue({
      roleId: String(officeTitle.roleId),
      title: officeTitle.title
    });
  }

  protected cancelOfficeTitleEdit(): void {
    this.editingOfficeTitleId.set(null);
    this.officeTitleForm.reset();
    this.setDefaultOfficeTitleRole();
  }

  protected deleteOfficeTitle(officeTitle: RoleOfficeTitle): void {
    this.isManaging.set(true);
    this.loadError.set('');

    this.adminService.deleteRoleOfficeTitle(officeTitle.id).subscribe({
      next: () => {
        this.officeTitles.update((titles) => titles.filter((item) => item.id !== officeTitle.id));
        this.isManaging.set(false);
        this.successMessage.set('Role category deleted.');
      },
      error: () => {
        this.isManaging.set(false);
        this.loadError.set('Could not delete role category.');
      }
    });
  }

  private loadDashboard(): void {
    this.isLoading.set(true);
    this.loadError.set('');

    forkJoin({
      users: this.adminService.getUsers(),
      roles: this.adminService.getRoles(),
      campuses: this.adminService.getCampuses(),
      officeTitles: this.adminService.getRoleOfficeTitles(),
      loginAudits: this.adminService.getLoginAudits()
    }).subscribe({
      next: ({ users, roles, campuses, officeTitles, loginAudits }) => {
        this.users.set(users);
        this.roles.set(roles);
        this.campuses.set(campuses);
        this.officeTitles.set(officeTitles);
        this.loginAudits.set(loginAudits);
        this.setDefaultSelects(roles, campuses);
        this.setDefaultOfficeTitleRole();
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.loadError.set('Could not load admin data. Make sure the backend is running.');
      }
    });
  }

  private setDefaultOfficeTitleRole(): void {
    const role = this.roles()[0];
    this.officeTitleForm.patchValue({
      roleId: role ? String(role.id) : ''
    });
  }

  private setDefaultSelects(roles: Role[], campuses: Campus[]): void {
    const requesterRole = roles.find((role) => role.name === 'Requester') ?? roles[0];
    const mainCampus = campuses.find((campus) => campus.isMain) ?? campuses[0];

    this.createUserForm.patchValue({
      roleId: requesterRole ? String(requesterRole.id) : '',
      campusId: mainCampus ? String(mainCampus.id) : ''
    });
    this.selectedRoleId.set(requesterRole ? String(requesterRole.id) : '');
    this.createUserForm.patchValue({ officeTitle: this.officeOptions()[0] ?? '' });
  }

  protected roleChanged(): void {
    this.selectedRoleId.set(this.createUserForm.controls.roleId.value);
    this.createUserForm.patchValue({ officeTitle: this.officeOptions()[0] ?? '' });

    const selectedRole = this.roles().find(
      (role) => String(role.id) === this.createUserForm.controls.roleId.value
    );
    const mainCampus = this.campuses().find((campus) => campus.isMain);

    if (selectedRole?.name === 'Union Approver' && mainCampus) {
      this.createUserForm.patchValue({ campusId: String(mainCampus.id) });
    }
  }
}
