import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';

@Component({
  selector: 'app-nueva-rendicion-directa',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './nueva-rendicion-directa.component.html',
})
export class NuevaRendicionDirectaComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private notifications = inject(NotificationService);
  private userState = inject(UserStateService);

  submitting = signal(false);

  form: FormGroup = this.fb.group({
    gestion: ['', [Validators.required, Validators.minLength(3)]],
  });

  goBack(): void {
    this.router.navigate(['/mis-rendiciones']);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const user = this.userState.getUser() as any;
    const userId = user?._id ?? '';
    const clientId =
      user?.companyId ||
      user?.client?._id ||
      (typeof user?.clientId === 'string' ? user.clientId : user?.clientId?._id) ||
      '';

    if (!userId || !clientId) {
      this.notifications.show('No se pudo identificar al usuario o empresa.', 'error');
      return;
    }

    this.submitting.set(true);
    this.expenseReportsService
      .create({
        gestion: this.form.value.gestion?.trim(),
        isDirecta: true,
        userId,
        clientId,
      })
      .subscribe({
        next: (report) => {
          this.submitting.set(false);
          this.notifications.show('Rendición creada correctamente.', 'success');
          this.router.navigate(['/mis-rendiciones', report._id, 'detalle']);
        },
        error: (err) => {
          this.submitting.set(false);
          const raw = err?.error?.message;
          const msg = Array.isArray(raw) ? raw.join(', ') : raw;
          this.notifications.show(msg || 'Error al crear la rendición.', 'error');
        },
      });
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }
}
