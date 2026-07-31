import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';

@Component({
  selector: 'app-nueva-caja-chica',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './nueva-caja-chica.component.html',
})
export class NuevaCajaChicaComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private notifications = inject(NotificationService);
  private userState = inject(UserStateService);

  submitting = signal(false);

  form: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
  });

  goBack(): void {
    this.router.navigate(['/mis-rendiciones'], { queryParams: { tab: 'caja-chica' } });
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
        title: this.form.value.title?.trim(),
        isCajaChica: true,
        userId,
        clientId,
      })
      .subscribe({
        next: (report) => {
          this.submitting.set(false);
          this.notifications.show('Rendicion de caja chica creada.', 'success');
          this.router.navigate(['/mis-rendiciones', report._id, 'detalle']);
        },
        error: (err) => {
          this.submitting.set(false);
          const msg = err?.error?.message ?? 'Error al crear la rendicion.';
          this.notifications.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
        },
      });
  }
}
