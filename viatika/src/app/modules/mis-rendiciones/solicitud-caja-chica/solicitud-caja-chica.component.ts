import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FondoCajaChicaService } from '../../../services/fondo-caja-chica.service';
import { NotificationService } from '../../../services/notification.service';
import {
  IFondoCajaChica,
  ISolicitudCajaChica,
  SOLICITUD_EN_CURSO_STATUSES,
} from '../../../interfaces/fondo-caja-chica.interface';

/**
 * Solicitud de caja chica. Calca la pantalla de Solicitud de Fondos
 * (`solicitud-viaticos`) a pedido del cliente: mismo encabezado fijo con el
 * total y el botón de envío, mismas tarjetas de sección y mismo pie en móvil.
 * Por eso comparte su maquetación con Tailwind directo en vez de las tarjetas
 * del design system.
 *
 * Es el mismo formulario con menos campos: sin lugar de destino, sin fechas,
 * sin centro de costo y sin orden de trabajo. Nombre, DNI, área, centro de
 * costo y cuenta bancaria se toman del perfil sin mostrarlos, y la fecha es la
 * del día.
 *
 * Sirve para dos cosas: pedir la asignación inicial y, después, pedir un
 * presupuesto NUEVO que reemplaza al vigente. Puede ser mayor (Tesorería
 * deposita la diferencia) o menor (queda un sobrante por devolver). Lo único
 * que no se permite es encimar dos solicitudes sin resolver.
 */
@Component({
  selector: 'app-solicitud-caja-chica',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './solicitud-caja-chica.component.html',
})
export class SolicitudCajaChicaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(FondoCajaChicaService);
  private notifications = inject(NotificationService);
  private router = inject(Router);

  loading = signal(true);
  submitting = signal(false);
  fondo = signal<IFondoCajaChica | null>(null);
  solicitudEnCurso = signal<ISolicitudCajaChica | null>(null);

  /** Refleja `amount` para que el total del encabezado se actualice al tipear. */
  private amountValue = signal(0);
  totalGeneral = computed(() => this.amountValue());

  /** Presupuesto vigente. 0 si todavía no tiene caja chica. */
  presupuestoActual = computed(() => Number(this.fondo()?.fundAmount ?? 0));

  /** Es un cambio de presupuesto, no la asignación inicial. */
  esCambio = computed(() => this.presupuestoActual() > 0);

  pageTitle = computed(() =>
    this.esCambio()
      ? 'Nuevo presupuesto de caja chica'
      : 'Solicitud de asignación de caja chica'
  );

  /** Lo que Tesorería tendría que depositar: solo la diferencia. */
  aDepositar = computed(() =>
    Math.max(0, round2(this.totalGeneral() - this.presupuestoActual()))
  );

  /** Lo que el responsable tendría que devolver si baja su presupuesto. */
  aDevolver = computed(() =>
    Math.max(0, round2(this.presupuestoActual() - this.totalGeneral()))
  );

  form: FormGroup = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    observations: [''],
  });

  ngOnInit(): void {
    this.form
      .get('amount')!
      .valueChanges.subscribe(v => this.amountValue.set(Number(v) || 0));

    forkJoin({
      fondo: this.service.findMyActive(),
      solicitudes: this.service.misSolicitudes(),
    }).subscribe({
      next: ({ fondo, solicitudes }) => {
        this.fondo.set(fondo);
        this.solicitudEnCurso.set(
          solicitudes.find(s => SOLICITUD_EN_CURSO_STATUSES.includes(s.status)) ??
            null
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  goBack(): void {
    this.router.navigate(['/mis-rendiciones'], {
      queryParams: { tab: 'caja-chica' },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.esCambio() && this.totalGeneral() === this.presupuestoActual()) {
      this.notifications.show(
        'El monto es igual a su presupuesto actual. Indique uno distinto.',
        'error'
      );
      return;
    }

    this.submitting.set(true);
    this.service
      .solicitar({
        amount: Number(this.form.value.amount),
        observations: this.form.value.observations?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.notifications.show(
            'Solicitud enviada. Queda pendiente de la aprobación de su jefe.',
            'success'
          );
          this.goBack();
        },
        error: err => {
          this.submitting.set(false);
          const msg = err?.error?.message ?? 'No se pudo enviar la solicitud.';
          this.notifications.show(
            Array.isArray(msg) ? msg.join(', ') : msg,
            'error'
          );
        },
      });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
