import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { NotificationService } from '../../../services/notification.service';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { InputComponent } from '../../../design-system/input/input.component';

interface CreateClientPayload {
  client: {
    codigo: string;
    comercialName: string;
    businessName: string;
    businessId: string;
    address: string;
    phone: string;
    email: string;
    logo?: string;
  };
  adminUser: {
    name: string;
    email: string;
  };
}

@Component({
  selector: 'app-client-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, InputComponent],
  templateUrl: './client-onboarding.component.html',
  styleUrl: './client-onboarding.component.scss',
})
export class ClientOnboardingComponent {
  private http = inject(HttpClient);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);

  form: FormGroup = this.fb.group({
    client: this.fb.group({
      codigo: ['', Validators.required],
      comercialName: ['', Validators.required],
      businessName: ['', Validators.required],
      businessId: [
        '',
        [Validators.required, Validators.minLength(11), Validators.maxLength(11)],
      ],
      address: ['', Validators.required],
      phone: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      logo: [''],
    }),
    adminUser: this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
    }),
  });

  loading = false;

  submit(): void {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    const payload: CreateClientPayload = this.form.value as CreateClientPayload;

    this.http
      .post(`${environment.api}/client/register-with-user`, payload)
      .subscribe({
        next: () => {
          this.loading = false;
          this.notificationService.show(
            'Cliente registrado correctamente. Se ha enviado un correo con las credenciales.',
            'success'
          );
          this.form.reset();
        },
        error: (error) => {
          this.loading = false;
          const message =
            error?.error?.message ||
            error?.message ||
            'Error al registrar el cliente. Intente nuevamente.';
          this.notificationService.show(message, 'error');
        },
      });
  }
}