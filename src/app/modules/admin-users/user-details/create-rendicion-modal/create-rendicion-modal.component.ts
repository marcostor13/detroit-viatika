import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ExpenseReportsService } from '../../../../services/expense-reports.service';
import { NotificationService } from '../../../../services/notification.service';
import { UserStateService } from '../../../../services/user-state.service';
import { ICreateExpenseReport } from '../../../../interfaces/expense-report.interface';
import { InvoicesService } from '../../../../modules/invoices/services/invoices.service';
import { IProject } from '../../../../modules/invoices/interfaces/project.interface';
import { PlacesAutocompleteDirective, PlaceResult } from '../../../../directives/places-autocomplete.directive';

@Component({
  selector: 'app-create-rendicion-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PlacesAutocompleteDirective],
  templateUrl: './create-rendicion-modal.component.html',
  styleUrls: ['./create-rendicion-modal.component.scss']
})
export class CreateRendicionModalComponent {
  @Input() isOpen = false;
  @Input() collaboratorId: string = '';
  @Output() close = new EventEmitter<boolean>();
  
  private fb = inject(FormBuilder);
  private expenseReportsService = inject(ExpenseReportsService);
  private notificationService = inject(NotificationService);
  private userStateService = inject(UserStateService);
  private invoicesService = inject(InvoicesService);

  projects: IProject[] = [];

  form: FormGroup = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    budget: [0, [Validators.required, Validators.min(0)]],
    projectId: ['', Validators.required],
    // New fields
    accountNumber: [''],
    idDocument: [''],
    peopleNames: this.fb.array([this.fb.control('')]),
    location: [''],
    startDate: [''],
    endDate: [''],
    items: this.fb.array([])
  });

  get peopleNames(): FormArray {
    return this.form.get('peopleNames') as FormArray;
  }

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  addPersonName() {
    this.peopleNames.push(this.fb.control(''));
  }

  removePersonName(index: number) {
    if (this.peopleNames.length > 1) {
      this.peopleNames.removeAt(index);
    } else {
      this.peopleNames.at(0).setValue('');
    }
  }

  addBudgetItem() {
    const itemForm = this.fb.group({
      description: ['', Validators.required],
      amount: [0, [Validators.required, Validators.min(0)]],
      peopleCount: [1, [Validators.required, Validators.min(1)]],
      fuelAmount: [0, [Validators.required, Validators.min(0)]],
      daysCount: [1, [Validators.required, Validators.min(1)]],
      total: [0]
    });

    // Subscribirse a cambios para calcular el total de la fila y el presupuesto general
    itemForm.valueChanges.subscribe(() => {
      this.calculateItemTotal(itemForm);
      this.calculateGeneralBudget();
    });

    this.items.push(itemForm);
  }

  removeBudgetItem(index: number) {
    this.items.removeAt(index);
    this.calculateGeneralBudget();
  }

  private calculateItemTotal(itemForm: FormGroup) {
    const { amount, peopleCount, fuelAmount, daysCount } = itemForm.getRawValue();
    // Formula simple: (Importe * Personas * Dias) + (Combustible * Dias)
    // Ajustar según lógica de negocio si es diferente. Por ahora basándonos en columnas.
    const total = (amount * peopleCount * daysCount) + (fuelAmount * daysCount);
    itemForm.patchValue({ total }, { emitEvent: false });
  }

  private calculateGeneralBudget() {
    const total = this.items.controls.reduce((sum, control) => {
      return sum + (control.get('total')?.value || 0);
    }, 0);
    this.form.patchValue({ budget: total }, { emitEvent: false });
  }

  ngOnInit() {
    this.loadProjects();
  }

  loadProjects() {
    const user = this.userStateService.getUser() as any;
    if (user) {
      const clientId = user.companyId || (user.client?._id) || (user.clientId?._id) || user.clientId;
      if (clientId) {
        this.invoicesService.getProjects(clientId).subscribe({
          next: (data) => this.projects = data,
          error: (err) => console.error('Error loading projects', err)
        });
      } else {
        console.warn('No clientId found to load projects');
      }
    }
  }

  closeModal(success: boolean = false) {
    this.form.reset({ budget: 0, title: '', description: '', projectId: '' });
    while (this.items.length !== 0) {
      this.items.removeAt(0);
    }
    while (this.peopleNames.length > 1) {
      this.peopleNames.removeAt(0);
    }
    if (this.peopleNames.length === 1) {
      this.peopleNames.at(0).setValue('');
    }
    this.close.emit(success);
  }

  onPlaceSelected(event: PlaceResult) {
    this.form.patchValue({ location: event.address });
  }

  onSubmit() {
    if (this.form.invalid) {
      this.notificationService.show('Por favor completa todos los campos requeridos', 'error');
      return;
    }

    const currentUser = this.userStateService.getUser() as any;
    if (!currentUser) {
      this.notificationService.show('Error con la sesión actual', 'error');
      return;
    }

    const clientId = currentUser.companyId || (currentUser.client?._id) || (currentUser.clientId?._id) || currentUser.clientId;
    if (!clientId) {
      this.notificationService.show('No se pudo identificar la empresa asociada a tu usuario', 'error');
      return;
    }

    const payload: ICreateExpenseReport = {
      ...this.form.value,
      userId: this.collaboratorId,
      clientId: clientId
    };

    this.expenseReportsService.create(payload).subscribe({
      next: () => {
        this.notificationService.show('Rendición creada exitosamente', 'success');
        this.closeModal(true);
      },
      error: (err) => {
        console.error('Error creating rendicion', err);
        this.notificationService.show('Ocurrió un error al crear la rendición', 'error');
      }
    });
  }
}
