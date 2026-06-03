import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Location } from '@angular/common';
import { environment } from '../../../environments/environment';
import { InvoicesService } from '../invoices/services/invoices.service';
import { UploadService } from '../../services/upload.service';
import { NotificationService } from '../../services/notification.service';
import { ISunatConfig } from '../../interfaces/sunat-config.interface';

interface IUserRow {
  _id: string;
  name: string;
  email: string;
  roleName: string;
  isActive: boolean;
  isCompanyAdmin: boolean;
  resetting: boolean;
  resetResult: string | null;
}

interface IClientForm {
  codigo: string;
  comercialName: string;
  businessName: string;
  businessId: string;
  address: string;
  phone: string;
  email: string;
}

interface IClientRow extends IClientForm {
  _id: string;
  logo?: string;
  // ui
  expanded: boolean;
  sunatConfig: ISunatConfig | null;
  sunatLoaded: boolean;
  sunatLoading: boolean;
  editing: boolean;
  editForm: IClientForm;
  logoFile: File | null;
  logoPreview: string | null;
  uploadingLogo: boolean;
  saving: boolean;
  showSunatForm: boolean;
  sunatForm: { ruc: string; clientIdSunat: string; clientSecret: string; isActive: boolean };
  savingSunat: boolean;
  testingConnection: boolean;
  showDeleteConfirm: boolean;
  deleteConfirmText: string;
  deleting: boolean;
  users: IUserRow[];
  usersLoaded: boolean;
  usersLoading: boolean;
}

@Component({
  selector: 'app-clients-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clients-admin.component.html',
  styleUrl: './clients-admin.component.scss',
})
export class ClientsAdminComponent implements OnInit {
  private http = inject(HttpClient);
  private location = inject(Location);
  private invoicesService = inject(InvoicesService);
  private uploadService = inject(UploadService);
  private notificationService = inject(NotificationService);

  clients: IClientRow[] = [];
  loading = false;
  showCreateForm = false;
  creating = false;
  creationResult: { companyName: string; adminEmail: string; temporaryPassword: string } | null = null;
  createForm: IClientForm = this.emptyForm();
  createLogoFile: File | null = null;
  createLogoPreview: string | null = null;
  createAdminUser = { name: '', email: '' };
  createSunatForm = { ruc: '', clientIdSunat: '', clientSecret: '', isActive: true, enabled: false };

  ngOnInit(): void {
    this.loadClients();
  }

  goBack(): void {
    this.location.back();
  }

  loadClients(): void {
    this.loading = true;
    this.http.get<any[]>(`${environment.api}/client`).subscribe({
      next: (clients) => {
        this.loading = false;
        console.log('[clients-admin] API response:', JSON.stringify(clients?.map(c => ({ _id: c._id, comercialName: c.comercialName, email: c.email, phone: c.phone, address: c.address }))));
        this.clients = (clients || []).map((c) => this.toRow(c));
      },
      error: () => {
        this.loading = false;
        this.notificationService.show('Error al cargar empresas', 'error');
      },
    });
  }

  private emptyForm(): IClientForm {
    return {
      codigo: '',
      comercialName: '',
      businessName: '',
      businessId: '',
      address: '',
      phone: '',
      email: '',
    };
  }

  private toRow(c: any): IClientRow {
    return {
      _id: c._id,
      codigo: c.codigo || '',
      comercialName: c.comercialName || '',
      businessName: c.businessName || '',
      businessId: c.businessId || '',
      address: c.address || '',
      phone: c.phone || '',
      email: c.email || '',
      logo: c.logo || '',
      expanded: false,
      sunatConfig: null,
      sunatLoaded: false,
      sunatLoading: false,
      editing: false,
      editForm: this.emptyForm(),
      logoFile: null,
      logoPreview: null,
      uploadingLogo: false,
      saving: false,
      showSunatForm: false,
      sunatForm: { ruc: '', clientIdSunat: '', clientSecret: '', isActive: true },
      savingSunat: false,
      testingConnection: false,
      showDeleteConfirm: false,
      deleteConfirmText: '',
      deleting: false,
      users: [],
      usersLoaded: false,
      usersLoading: false,
    };
  }

  toggleExpand(row: IClientRow): void {
    row.expanded = !row.expanded;
    if (row.expanded) {
      if (!row.sunatLoaded) this.loadSunat(row);
      if (!row.usersLoaded) this.loadUsers(row);
    }
  }

  private loadSunat(row: IClientRow): void {
    row.sunatLoading = true;
    this.invoicesService.getSunatConfig(row._id).subscribe({
      next: (config) => {
        row.sunatConfig = config;
        row.sunatLoaded = true;
        row.sunatLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        row.sunatConfig = null;
        row.sunatLoaded = true;
        row.sunatLoading = false;
        if (err.status !== 404) {
          this.notificationService.show('Error al cargar configuración SUNAT', 'error');
        }
      },
    });
  }

  // --- Company data editing ---

  openCreateForm(): void {
    this.resetCreateForm();
    this.showCreateForm = true;
  }

  cancelCreate(): void {
    this.showCreateForm = false;
    this.resetCreateForm();
  }

  dismissCreationResult(): void {
    this.creationResult = null;
  }

  copyPassword(password: string): void {
    navigator.clipboard.writeText(password).then(() => {
      this.notificationService.show('Contraseña copiada', 'success');
    });
  }

  onCreateLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.createLogoFile = file;
    const reader = new FileReader();
    reader.onload = (e: any) => { this.createLogoPreview = e.target.result; };
    reader.readAsDataURL(file);
  }

  createClient(): void {
    if (!this.createForm.codigo.trim()) {
      this.notificationService.show('El código es obligatorio', 'error');
      return;
    }
    if (!this.createForm.comercialName.trim()) {
      this.notificationService.show('El nombre comercial es obligatorio', 'error');
      return;
    }
    if (!this.createForm.businessName.trim()) {
      this.notificationService.show('La razón social es obligatoria', 'error');
      return;
    }
    if (!this.createForm.businessId.trim()) {
      this.notificationService.show('El RUC es obligatorio', 'error');
      return;
    }
    if (!this.createAdminUser.name.trim()) {
      this.notificationService.show('El nombre del administrador es obligatorio', 'error');
      return;
    }
    if (!this.createAdminUser.email.trim()) {
      this.notificationService.show('El email del administrador es obligatorio', 'error');
      return;
    }
    this.creating = true;

    const clientPayload = {
      codigo: this.createForm.codigo.trim(),
      comercialName: this.createForm.comercialName.trim(),
      businessName: this.createForm.businessName.trim(),
      businessId: this.createForm.businessId.trim(),
      address: this.createForm.address.trim(),
      phone: this.createForm.phone.trim(),
      email: this.createForm.email.trim(),
      logo: '',
    };

    const registerPayload = {
      client: clientPayload,
      adminUser: {
        name: this.createAdminUser.name.trim(),
        email: this.createAdminUser.email.trim(),
      },
    };

    console.log('[createClient] payload enviado:', JSON.stringify({ email: clientPayload.email, phone: clientPayload.phone, address: clientPayload.address }));
    this.http.post<any>(`${environment.api}/client/register-with-user`, registerPayload).subscribe({
      next: (result) => {
        const created = result.client;
        const adminUser = result.adminUser;

        const afterLogo = (clientData: any) => {
          const sunat = this.createSunatForm;
          if (sunat.enabled && sunat.clientIdSunat.trim() && sunat.clientSecret.trim()) {
            this.invoicesService.createSunatConfig(clientData._id, {
              ruc: sunat.ruc,
              clientIdSunat: sunat.clientIdSunat,
              clientSecret: sunat.clientSecret,
              isActive: sunat.isActive,
            }).subscribe({
              next: (config) => {
                const row = this.toRow(clientData);
                row.sunatConfig = config;
                row.sunatLoaded = true;
                this.creating = false;
                this.showCreateForm = false;
                this.creationResult = { companyName: clientData.comercialName, adminEmail: adminUser.email, temporaryPassword: adminUser.temporaryPassword };
                this.resetCreateForm();
                this.clients = [row, ...this.clients];
              },
              error: () => {
                this.creating = false;
                this.showCreateForm = false;
                this.creationResult = { companyName: clientData.comercialName, adminEmail: adminUser.email, temporaryPassword: adminUser.temporaryPassword };
                this.resetCreateForm();
                this.clients = [this.toRow(clientData), ...this.clients];
                this.notificationService.show('No se pudo guardar la configuración SUNAT.', 'error');
              },
            });
          } else {
            this.creating = false;
            this.showCreateForm = false;
            this.creationResult = { companyName: clientData.comercialName, adminEmail: adminUser.email, temporaryPassword: adminUser.temporaryPassword };
            this.resetCreateForm();
            this.clients = [this.toRow(clientData), ...this.clients];
          }
        };

        if (this.createLogoFile) {
          const path = `company-logos/${created._id}`;
          const { downloadUrl$ } = this.uploadService.uploadFile(this.createLogoFile, path);
          downloadUrl$.subscribe({
            next: (url) => {
              this.http.patch<any>(`${environment.api}/client/${created._id}`, { logo: url }).subscribe({
                next: (updated) => afterLogo(updated),
                error: () => afterLogo(created),
              });
            },
            error: () => afterLogo(created),
          });
        } else {
          afterLogo(created);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.creating = false;
        const message = Array.isArray(err.error?.message)
          ? err.error.message.join(', ')
          : err.error?.message || 'Error al crear empresa';
        this.notificationService.show(message, 'error');
      },
    });
  }

  private resetCreateForm(): void {
    this.createForm = this.emptyForm();
    this.createLogoFile = null;
    this.createLogoPreview = null;
    this.createAdminUser = { name: '', email: '' };
    this.createSunatForm = { ruc: '', clientIdSunat: '', clientSecret: '', isActive: true, enabled: false };
  }

  startEdit(row: IClientRow): void {
    row.editForm = {
      codigo: row.codigo,
      comercialName: row.comercialName,
      businessName: row.businessName,
      businessId: row.businessId,
      address: row.address,
      phone: row.phone,
      email: row.email,
    };
    row.logoFile = null;
    row.logoPreview = null;
    row.editing = true;
  }

  cancelEdit(row: IClientRow): void {
    row.editing = false;
    row.logoFile = null;
    row.logoPreview = null;
  }

  onLogoSelected(row: IClientRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    row.logoFile = file;
    const reader = new FileReader();
    reader.onload = (e: any) => { row.logoPreview = e.target.result; };
    reader.readAsDataURL(file);
  }

  saveEdit(row: IClientRow): void {
    if (!row.editForm.codigo.trim()) {
      this.notificationService.show('El código es obligatorio', 'error');
      return;
    }
    if (!row.editForm.comercialName.trim()) {
      this.notificationService.show('El nombre comercial es obligatorio', 'error');
      return;
    }
    row.saving = true;
    console.log('[saveEdit] editForm enviado:', JSON.stringify({ email: row.editForm.email, phone: row.editForm.phone, address: row.editForm.address }));
    this.http.patch<any>(`${environment.api}/client/${row._id}`, row.editForm).subscribe({
      next: (updated) => {
        row.codigo = updated.codigo || row.editForm.codigo;
        row.comercialName = updated.comercialName || row.editForm.comercialName;
        row.businessName = updated.businessName || row.editForm.businessName;
        row.businessId = updated.businessId || row.editForm.businessId;
        row.address = updated.address || row.editForm.address;
        row.phone = updated.phone || row.editForm.phone;
        row.email = updated.email || row.editForm.email;
        if (row.logoFile) {
          this.uploadLogo(row);
        } else {
          row.saving = false;
          row.editing = false;
          this.notificationService.show('Empresa actualizada', 'success');
        }
      },
      error: (err: HttpErrorResponse) => {
        row.saving = false;
        const message = Array.isArray(err.error?.message)
          ? err.error.message.join(', ')
          : err.error?.message || 'Error al actualizar empresa';
        this.notificationService.show(message, 'error');
      },
    });
  }

  private uploadLogo(row: IClientRow): void {
    row.uploadingLogo = true;
    const path = `company-logos/${row._id}`;
    const { downloadUrl$ } = this.uploadService.uploadFile(row.logoFile!, path);
    downloadUrl$.subscribe({
      next: (url) => {
        this.http.patch<any>(`${environment.api}/client/${row._id}`, { logo: url }).subscribe({
          next: (updated) => {
            row.logo = updated.logo || url;
            row.uploadingLogo = false;
            row.saving = false;
            row.editing = false;
            row.logoFile = null;
            row.logoPreview = null;
            this.notificationService.show('Empresa actualizada', 'success');
          },
          error: () => {
            row.uploadingLogo = false;
            row.saving = false;
            this.notificationService.show('Error al guardar logo', 'error');
          },
        });
      },
      error: () => {
        row.uploadingLogo = false;
        row.saving = false;
        this.notificationService.show('Error al subir logo', 'error');
      },
    });
  }

  // --- Delete client ---

  openDeleteConfirm(row: IClientRow): void {
    row.showDeleteConfirm = true;
    row.deleteConfirmText = '';
  }

  cancelDeleteConfirm(row: IClientRow): void {
    row.showDeleteConfirm = false;
    row.deleteConfirmText = '';
  }

  confirmDeleteClient(row: IClientRow): void {
    if (row.deleteConfirmText !== 'eliminar empresa definitivamente') return;
    row.deleting = true;
    this.http.delete(`${environment.api}/client/${row._id}`).subscribe({
      next: () => {
        this.clients = this.clients.filter(c => c._id !== row._id);
        this.notificationService.show('Empresa y sus usuarios eliminados correctamente', 'success');
      },
      error: () => {
        row.deleting = false;
        this.notificationService.show('Error al eliminar la empresa', 'error');
      },
    });
  }

  // --- Users ---

  private loadUsers(row: IClientRow): void {
    row.usersLoading = true;
    this.http.get<any[]>(`${environment.api}/user/client/${row._id}`).subscribe({
      next: (users) => {
        const allUsers = (users || []).map((u: any) => ({
          _id: u._id,
          name: u.name || '',
          email: u.email || '',
          roleName: u.role?.name || '',
          isActive: u.isActive !== false,
          isCompanyAdmin: u.isCompanyAdmin === true,
          resetting: false,
          resetResult: null,
        }));
        const companyAdmins = allUsers.filter((u: IUserRow) => u.isCompanyAdmin);
        row.users = companyAdmins.length > 0
          ? companyAdmins
          : allUsers.filter((u: IUserRow) => u.roleName === 'Administrador').slice(0, 1);
        row.usersLoaded = true;
        row.usersLoading = false;
      },
      error: () => {
        row.usersLoaded = true;
        row.usersLoading = false;
        this.notificationService.show('Error al cargar usuarios', 'error');
      },
    });
  }

  resetUserPassword(user: IUserRow): void {
    user.resetting = true;
    user.resetResult = null;
    this.http.post<{ temporaryPassword: string }>(`${environment.api}/user/${user._id}/reset-password`, {}).subscribe({
      next: (result) => {
        user.resetting = false;
        user.resetResult = result.temporaryPassword;
      },
      error: () => {
        user.resetting = false;
        this.notificationService.show('Error al resetear la contraseña', 'error');
      },
    });
  }

  dismissResetResult(user: IUserRow): void {
    user.resetResult = null;
  }

  // --- SUNAT config ---

  openSunatForm(row: IClientRow): void {
    if (row.sunatConfig) {
      row.sunatForm = {
        ruc: row.sunatConfig.ruc || '',
        clientIdSunat: row.sunatConfig.clientIdSunat || '',
        clientSecret: row.sunatConfig.clientSecret || '',
        isActive: row.sunatConfig.isActive ?? true,
      };
    } else {
      row.sunatForm = { ruc: '', clientIdSunat: '', clientSecret: '', isActive: true };
    }
    row.showSunatForm = true;
  }

  cancelSunatForm(row: IClientRow): void {
    row.showSunatForm = false;
  }

  saveSunat(row: IClientRow): void {
    if (!row.sunatForm.clientIdSunat.trim() || !row.sunatForm.clientSecret.trim()) {
      this.notificationService.show('Client ID y Client Secret son obligatorios', 'error');
      return;
    }
    row.savingSunat = true;
    if (row.sunatConfig?._id) {
      this.invoicesService.updateSunatConfig({ ...row.sunatForm, _id: row.sunatConfig._id }).subscribe({
        next: (config) => {
          row.sunatConfig = config;
          row.showSunatForm = false;
          row.savingSunat = false;
          this.notificationService.show('Configuración SUNAT actualizada', 'success');
        },
        error: () => {
          row.savingSunat = false;
          this.notificationService.show('Error al actualizar SUNAT', 'error');
        },
      });
    } else {
      this.invoicesService.createSunatConfig(row._id, row.sunatForm).subscribe({
        next: (config) => {
          row.sunatConfig = config;
          row.showSunatForm = false;
          row.savingSunat = false;
          this.notificationService.show('Configuración SUNAT creada', 'success');
        },
        error: () => {
          row.savingSunat = false;
          this.notificationService.show('Error al crear SUNAT', 'error');
        },
      });
    }
  }

  deleteSunat(row: IClientRow): void {
    if (!row.sunatConfig?._id) return;
    if (!confirm('¿Eliminar la configuración SUNAT de esta empresa?')) return;
    this.invoicesService.deleteSunatConfig(row.sunatConfig._id).subscribe({
      next: () => {
        row.sunatConfig = null;
        this.notificationService.show('Configuración SUNAT eliminada', 'success');
      },
      error: () => this.notificationService.show('Error al eliminar SUNAT', 'error'),
    });
  }

  testSunat(row: IClientRow): void {
    row.testingConnection = true;
    this.invoicesService.testSunatCredentials(row._id).subscribe({
      next: (result) => {
        row.testingConnection = false;
        this.loadSunat(row);
        if (result.success) {
          this.notificationService.show('Conexión SUNAT exitosa: ' + result.message, 'success');
        } else {
          this.notificationService.show('Error SUNAT: ' + result.message, 'error');
        }
      },
      error: (err: HttpErrorResponse) => {
        row.testingConnection = false;
        this.notificationService.show('Error al probar conexión SUNAT: ' + err.message, 'error');
      },
    });
  }
}
