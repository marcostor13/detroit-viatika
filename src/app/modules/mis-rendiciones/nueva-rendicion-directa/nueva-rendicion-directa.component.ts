import { Component, OnInit, inject, signal } from '@angular/core';
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
import { InvoicesService } from '../../invoices/services/invoices.service';
import { IProject } from '../../invoices/interfaces/project.interface';

@Component({
  selector: 'app-nueva-rendicion-directa',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './nueva-rendicion-directa.component.html',
})
export class NuevaRendicionDirectaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private notifications = inject(NotificationService);
  private userState = inject(UserStateService);
  private invoicesService = inject(InvoicesService);

  submitting = signal(false);
  projects = signal<IProject[]>([]);

  form: FormGroup = this.fb.group({
    motivo: ['', [Validators.required, Validators.minLength(5)]],
    location: [''],
    startDate: [''],
    endDate: [''],
    projectId: [''],
    peopleNames: [''],
    budget: [null],
    description: [''],
  });

  ngOnInit(): void {
    this.loadProjects();
  }

  private loadProjects(): void {
    const user = this.userState.getUser() as any;
    const clientId =
      user?.companyId ||
      user?.client?._id ||
      (typeof user?.clientId === 'string' ? user.clientId : user?.clientId?._id) ||
      '';
    if (!clientId) return;
    this.invoicesService.getProjects(clientId).subscribe({
      next: (list) => this.projects.set(list ?? []),
      error: () => this.projects.set([]),
    });
  }

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

    const raw = this.form.value;

    const peopleNames: string[] = raw.peopleNames
      ? (raw.peopleNames as string)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];

    this.submitting.set(true);
    this.expenseReportsService
      .create({
        motivo: raw.motivo?.trim(),
        isDirecta: true,
        userId,
        clientId,
        location: raw.location?.trim() || undefined,
        startDate: raw.startDate || undefined,
        endDate: raw.endDate || undefined,
        projectId: raw.projectId || undefined,
        peopleNames: peopleNames.length ? peopleNames : undefined,
        budget: raw.budget ? Number(raw.budget) : undefined,
        description: raw.description?.trim() || undefined,
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
