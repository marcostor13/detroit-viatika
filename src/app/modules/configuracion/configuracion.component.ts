import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { InvoicesService } from '../invoices/services/invoices.service';
import { NotificationService } from '../../services/notification.service';
import { MaskPipe } from '../../pipes/mask.pipe';
import { ICompanyConfig } from '../../interfaces/company-config.interface';
import { ISunatConfig } from '../../interfaces/sunat-config.interface';
import { CompanyConfigService } from '../../services/company-config.service';
import { UserStateService } from '../../services/user-state.service';
import { UploadService } from '../../services/upload.service';
import { AccountingConfigService } from '../../services/accounting-config.service';
import {
  IAccountingConfig,
  IBankAccount,
  DEFAULT_ACCOUNTING_CONFIG,
} from '../../interfaces/accounting-config.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { IconComponent } from '../../design-system/icon/icon.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-configuracion',
  templateUrl: './configuracion.component.html',
  styleUrls: ['./configuracion.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, MaskPipe, ButtonComponent, IconComponent],
})
export class ConfiguracionComponent implements OnInit {
  private invoicesService = inject(InvoicesService);
  private notificationService = inject(NotificationService);
  private companyConfigService = inject(CompanyConfigService);
  private userStateService = inject(UserStateService);
  private uploadService = inject(UploadService);
  private accountingConfigService = inject(AccountingConfigService);
  private http = inject(HttpClient);

  // Company config
  companyConfig: ICompanyConfig | null = null;
  showCompanyForm = false;
  selectedLogoFile: File | null = null;
  logoPreview: string | null = null;
  companyName: string = '';
  logoUploadProgress: number = 0;
  isUploadingLogo: boolean = false;

  // Limits
  showLimitsForm = false;
  limitsMovilidadDiario: number | null = null;
  isSavingLimits = false;

  // Notifications
  showNotificationsForm = false;
  notificationsEnabled = false;
  notificationsFrequency: 'semanal' | 'mensual' = 'semanal';
  notificationsDay: number = 1;
  isSavingNotifications = false;

  // Profile
  showProfileForm = false;
  profileName: string = '';
  profilePicFile: File | null = null;
  profilePicPreview: string | null = null;
  isUploadingProfilePic = false;
  profilePicUploadProgress = 0;
  isSavingProfile = false;

  // Password
  showPasswordForm = false;
  newPassword: string = '';
  confirmPassword: string = '';
  isSavingPassword = false;

  // Accounting config (plan de cuentas + bancos)
  accountingConfig: IAccountingConfig | null = null;
  showAccountingForm = false;
  accountingForm: IAccountingConfig = { ...DEFAULT_ACCOUNTING_CONFIG };
  isSavingAccounting = false;

  // Tesoreria emails
  showTesoreriaEmailsForm = false;
  tesoreriaEmails: string[] = [];
  newTesoreriaEmail = '';
  isSavingTesoreriaEmails = false;

  get currentUser() { return this.userStateService.getUser(); }
  get isAdminUser() { return this.userStateService.isAdmin() || this.userStateService.isSuperAdmin(); }
  get canConfigureEmpresa() { return this.isAdminUser || this.userStateService.isContabilidad(); }
  get canConfigureContabilidad() { return this.isAdminUser || this.userStateService.isContabilidad(); }

  sunatConfig: ISunatConfig | null = null;
  showSunatForm = false;
  sunatForm: Partial<ISunatConfig> = {
    clientId: '',
    clientSecret: '',
    ruc: '',
    isActive: true,
  };

  loading = false;

  ngOnInit() {
    this.loadCompanyConfig();
    if (this.isAdminUser) {
      this.loadSunatConfig();
    }
    if (this.canConfigureContabilidad) {
      this.loadAccountingConfig();
    }
  }

  loadCompanyConfig() {
    this.companyConfigService.companyConfig$.subscribe(
      (config: ICompanyConfig | null) => {
        this.companyConfig = config;
        this.limitsMovilidadDiario = config?.limits?.movilidadDiario ?? null;
        this.notificationsEnabled = config?.notificationSettings?.enabled ?? false;
        this.notificationsFrequency = config?.notificationSettings?.frequency ?? 'semanal';
        this.notificationsDay = config?.notificationSettings?.notificationDay ?? 1;
        this.tesoreriaEmails = [...(config?.tesoreriaEmails ?? [])];
      }
    );
  }

  editLimits() {
    this.limitsMovilidadDiario = this.companyConfig?.limits?.movilidadDiario ?? null;
    this.showLimitsForm = true;
  }

  cancelLimitsEdit() {
    this.showLimitsForm = false;
    this.limitsMovilidadDiario = this.companyConfig?.limits?.movilidadDiario ?? null;
  }

  saveLimits() {
    const companyId = this.companyConfig?._id || this.companyConfig?.companyId;
    if (!companyId) return;
    this.isSavingLimits = true;
    this.companyConfigService.updateLimits(companyId, {
      movilidadDiario: this.limitsMovilidadDiario ?? undefined,
    }).subscribe({
      next: () => {
        this.notificationService.show('Límites actualizados correctamente', 'success');
        this.showLimitsForm = false;
        this.isSavingLimits = false;
      },
      error: () => {
        this.notificationService.show('Error al guardar los límites', 'error');
        this.isSavingLimits = false;
      },
    });
  }

  editNotifications() {
    this.notificationsEnabled = this.companyConfig?.notificationSettings?.enabled ?? false;
    this.notificationsFrequency = this.companyConfig?.notificationSettings?.frequency ?? 'semanal';
    this.notificationsDay = this.companyConfig?.notificationSettings?.notificationDay ?? 1;
    this.showNotificationsForm = true;
  }

  cancelNotificationsEdit() {
    this.showNotificationsForm = false;
    this.notificationsEnabled = this.companyConfig?.notificationSettings?.enabled ?? false;
    this.notificationsFrequency = this.companyConfig?.notificationSettings?.frequency ?? 'semanal';
    this.notificationsDay = this.companyConfig?.notificationSettings?.notificationDay ?? 1;
  }

  saveNotifications() {
    const companyId = this.companyConfig?._id || this.companyConfig?.companyId;
    if (!companyId) return;
    this.isSavingNotifications = true;
    this.invoicesService.updateNotificationSettings(companyId, {
      enabled: this.notificationsEnabled,
      frequency: this.notificationsFrequency,
      notificationDay: this.notificationsDay,
    }).subscribe({
      next: () => {
        this.notificationService.show('Configuración de notificaciones guardada', 'success');
        this.showNotificationsForm = false;
        this.isSavingNotifications = false;
        this.companyConfigService.refreshConfig();
      },
      error: () => {
        this.notificationService.show('Error al guardar la configuración de notificaciones', 'error');
        this.isSavingNotifications = false;
      },
    });
  }

  editTesoreriaEmails() {
    this.tesoreriaEmails = [...(this.companyConfig?.tesoreriaEmails ?? [])];
    this.newTesoreriaEmail = '';
    this.showTesoreriaEmailsForm = true;
  }

  cancelTesoreriaEmailsEdit() {
    this.showTesoreriaEmailsForm = false;
    this.tesoreriaEmails = [...(this.companyConfig?.tesoreriaEmails ?? [])];
    this.newTesoreriaEmail = '';
  }

  addTesoreriaEmail() {
    const email = this.newTesoreriaEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      this.notificationService.show('Ingresa un correo electrónico válido', 'error');
      return;
    }
    if (this.tesoreriaEmails.includes(email)) {
      this.notificationService.show('Este correo ya está en la lista', 'error');
      return;
    }
    this.tesoreriaEmails.push(email);
    this.newTesoreriaEmail = '';
  }

  removeTesoreriaEmail(index: number) {
    this.tesoreriaEmails.splice(index, 1);
  }

  saveTesoreriaEmails() {
    const companyId = this.companyConfig?._id || this.companyConfig?.companyId;
    if (!companyId) return;
    this.isSavingTesoreriaEmails = true;
    this.invoicesService.updateTesoreriaEmails(companyId, this.tesoreriaEmails).subscribe({
      next: () => {
        this.notificationService.show('Correos de tesoreria guardados', 'success');
        this.showTesoreriaEmailsForm = false;
        this.isSavingTesoreriaEmails = false;
        this.companyConfigService.refreshConfig();
      },
      error: () => {
        this.notificationService.show('Error al guardar los correos de tesoreria', 'error');
        this.isSavingTesoreriaEmails = false;
      },
    });
  }

  editCompanyConfig() {
    this.showCompanyForm = true;
    this.companyName = this.companyConfig?.businessName || '';
  }

  cancelCompanyEdit() {
    this.showCompanyForm = false;
    this.selectedLogoFile = null;
    this.logoPreview = null;
    this.companyName = '';
  }

  onLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedLogoFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.logoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  saveCompanyConfig() {
    if (!this.companyName?.trim()) {
      this.notificationService.show(
        'El nombre de la empresa es obligatorio',
        'error'
      );
      return;
    }

    this.companyConfigService.updateCompanyName(this.companyName).subscribe({
      next: () => {
        this.notificationService.show(
          'Nombre de empresa actualizado exitosamente',
          'success'
        );
        this.companyConfigService.refreshConfig();
        if (this.selectedLogoFile) {
          this.uploadLogo();
        } else {
          this.cancelCompanyEdit();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.notificationService.show(
          'Error al actualizar nombre de empresa: ' + error.message,
          'error'
        );
      },
    });
  }

  private uploadLogo() {
    if (!this.selectedLogoFile) return;

    this.isUploadingLogo = true;
    this.logoUploadProgress = 0;

    this.companyConfigService
      .uploadCompanyLogo(this.selectedLogoFile, this.companyConfig?._id!)
      .subscribe({
        next: (result) => {
          if (result.type === 'progress' && result.progress !== undefined) {
            this.logoUploadProgress = Math.round(result.progress);
          } else if (result.type === 'complete') {
            this.notificationService.show(
              'Logo de empresa actualizado exitosamente',
              'success'
            );
            this.isUploadingLogo = false;
            this.logoUploadProgress = 0;
            this.cancelCompanyEdit();
            this.companyConfigService.refreshConfig();
          } else if (result.type === 'error') {
            this.notificationService.show('Error al subir logo', 'error');
            this.isUploadingLogo = false;
            this.logoUploadProgress = 0;
          }
        },
        error: (error: HttpErrorResponse) => {
          this.notificationService.show(
            'Error al subir logo: ' + error.message,
            'error'
          );
          this.isUploadingLogo = false;
          this.logoUploadProgress = 0;
        },
      });
  }

  private getClientId(): string {
    const user = this.userStateService.getUser();
    return (
      (user as { companyId?: string })?.companyId ||
      (user as { client?: { _id: string } })?.client?._id ||
      ''
    );
  }

  loadSunatConfig() {
    const clientId = this.getClientId();
    if (!clientId) return;

    this.invoicesService.getSunatConfig(clientId).subscribe({
      next: (config) => {
        this.sunatConfig = config;
      },
      error: (error: HttpErrorResponse) => {
        if (error.status !== 404) {
          this.notificationService.show(
            'Error al cargar configuración SUNAT: ' + error.message,
            'error'
          );
        }
      },
    });
  }

  editSunatConfig() {
    this.showSunatForm = true;
    if (this.sunatConfig) {
      this.sunatForm = {
        _id: this.sunatConfig._id,
        ruc: this.sunatConfig.ruc,
        clientIdSunat: this.sunatConfig.clientIdSunat,
        clientSecret: this.sunatConfig.clientSecret,
        isActive: this.sunatConfig.isActive,
      };
    } else {
      this.sunatForm = {
        ruc: '',
        clientIdSunat: '',
        clientSecret: '',
        isActive: true,
      };
    }
  }

  cancelSunatEdit() {
    this.showSunatForm = false;
    this.sunatForm = {
      clientIdSunat: '',
      clientSecret: '',
      isActive: true,
    };
  }

  saveSunatConfig() {
    if (
      !this.sunatForm.clientIdSunat?.trim() ||
      !this.sunatForm.clientSecret?.trim()
    ) {
      this.notificationService.show(
        'El Client ID y Client Secret son obligatorios',
        'error'
      );
      return;
    }

    if (this.sunatConfig) {
      this.invoicesService
        .updateSunatConfig({ ...this.sunatForm, _id: this.sunatConfig._id })
        .subscribe({
        next: (config) => {
          this.sunatConfig = config;
          this.notificationService.show(
            'Configuración SUNAT actualizada exitosamente',
            'success'
          );
          this.cancelSunatEdit();
        },
        error: (error: HttpErrorResponse) => {
          this.notificationService.show(
            'Error al actualizar configuración SUNAT: ' + error.message,
            'error'
          );
        },
      });
    } else {
      const clientId = this.getClientId();
      if (!clientId) {
        this.notificationService.show(
          'No se encontró companyId. Inicia sesión nuevamente.',
          'error'
        );
        return;
      }
      this.invoicesService.createSunatConfig(clientId, this.sunatForm).subscribe({
        next: (config) => {
          this.sunatConfig = config;
          this.notificationService.show(
            'Configuración SUNAT creada exitosamente',
            'success'
          );
          this.cancelSunatEdit();
        },
        error: (error: HttpErrorResponse) => {
          this.notificationService.show(
            'Error al crear configuración SUNAT: ' + error.message,
            'error'
          );
        },
      });
    }
  }

  deleteSunatConfig() {
    if (
      confirm(
        '¿Estás seguro de que quieres eliminar la configuración de SUNAT?'
      )
    ) {
      const configId = this.sunatConfig?._id;
      if (!configId) return;

      this.invoicesService.deleteSunatConfig(configId).subscribe({
        next: () => {
          this.sunatConfig = null;
          this.notificationService.show(
            'Configuración SUNAT eliminada exitosamente',
            'success'
          );
        },
        error: (error: HttpErrorResponse) => {
          this.notificationService.show(
            'Error al eliminar configuración SUNAT: ' + error.message,
            'error'
          );
        },
      });
    }
  }

  // --- Perfil ---

  editProfile() {
    this.profileName = this.currentUser?.name || '';
    this.profilePicPreview = null;
    this.profilePicFile = null;
    this.showProfileForm = true;
  }

  cancelProfileEdit() {
    this.showProfileForm = false;
    this.profileName = '';
    this.profilePicFile = null;
    this.profilePicPreview = null;
    this.profilePicUploadProgress = 0;
  }

  onProfilePicSelected(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;
    this.profilePicFile = file;
    const reader = new FileReader();
    reader.onload = (e: any) => { this.profilePicPreview = e.target.result; };
    reader.readAsDataURL(file);
  }

  saveProfile() {
    if (!this.profileName.trim()) {
      this.notificationService.show('El nombre es obligatorio', 'error');
      return;
    }
    if (this.profilePicFile) {
      this.uploadProfilePicThenSave();
    } else {
      this.patchProfile(undefined);
    }
  }

  private uploadProfilePicThenSave() {
    const user = this.currentUser;
    if (!user) return;
    this.isUploadingProfilePic = true;
    this.profilePicUploadProgress = 0;
    const path = `profile-pics/${user._id}`;
    const { uploadProgress$, downloadUrl$ } = this.uploadService.uploadFile(this.profilePicFile!, path);
    uploadProgress$.subscribe(p => { this.profilePicUploadProgress = Math.round(p); });
    downloadUrl$.subscribe({
      next: (url) => {
        this.isUploadingProfilePic = false;
        this.patchProfile(url);
      },
      error: () => {
        this.isUploadingProfilePic = false;
        this.notificationService.show('Error al subir la imagen', 'error');
      },
    });
  }

  private patchProfile(profilePicUrl: string | undefined) {
    const token = this.userStateService.getToken();
    const body: Record<string, string> = { name: this.profileName.trim() };
    if (profilePicUrl !== undefined) body['profilePic'] = profilePicUrl;
    this.isSavingProfile = true;
    this.http.patch<any>(
      `${environment.api}/user/profile`,
      body,
      { headers: { Authorization: `Bearer ${token}` } }
    ).subscribe({
      next: (updated) => {
        this.isSavingProfile = false;
        const current = this.currentUser!;
        this.userStateService.setUser({
          ...current,
          name: updated.name ?? this.profileName.trim(),
          profilePic: updated.profilePic ?? profilePicUrl ?? current.profilePic,
        });
        this.notificationService.show('Perfil actualizado correctamente', 'success');
        this.cancelProfileEdit();
      },
      error: () => {
        this.isSavingProfile = false;
        this.notificationService.show('Error al actualizar el perfil', 'error');
      },
    });
  }

  editPassword() { this.showPasswordForm = true; this.newPassword = ''; this.confirmPassword = ''; }

  cancelPasswordEdit() { this.showPasswordForm = false; this.newPassword = ''; this.confirmPassword = ''; }

  savePassword() {
    if (this.newPassword.length < 8) {
      this.notificationService.show('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.notificationService.show('Las contraseñas no coinciden', 'error');
      return;
    }
    const token = this.userStateService.getToken();
    this.isSavingPassword = true;
    this.http.patch(
      `${environment.api}/user/profile/password`,
      { password: this.newPassword },
      { headers: { Authorization: `Bearer ${token}` } }
    ).subscribe({
      next: () => {
        this.isSavingPassword = false;
        this.notificationService.show('Contraseña actualizada correctamente', 'success');
        this.cancelPasswordEdit();
      },
      error: () => {
        this.isSavingPassword = false;
        this.notificationService.show('Error al actualizar la contraseña', 'error');
      },
    });
  }

  // --- Configuración contable (Plan de cuentas + Bancos) ---

  loadAccountingConfig() {
    const clientId = this.getClientId();
    if (!clientId) return;
    this.accountingConfigService.getConfig(clientId).subscribe({
      next: (config) => {
        this.accountingConfig = config;
      },
      error: (error: HttpErrorResponse) => {
        if (error.status !== 404) {
          this.notificationService.show(
            'Error al cargar configuración contable: ' + error.message,
            'error'
          );
        }
      },
    });
  }

  editAccountingConfig() {
    // Clona la config actual sobre los defaults para no perder campos nuevos.
    this.accountingForm = {
      ...DEFAULT_ACCOUNTING_CONFIG,
      ...(this.accountingConfig ?? {}),
      igvRates: (this.accountingConfig?.igvRates?.length
        ? this.accountingConfig.igvRates
        : DEFAULT_ACCOUNTING_CONFIG.igvRates
      ).map((r) => ({ ...r })),
      inafectoKeywords: [
        ...(this.accountingConfig?.inafectoKeywords ??
          DEFAULT_ACCOUNTING_CONFIG.inafectoKeywords),
      ],
      bankAccounts: (this.accountingConfig?.bankAccounts ?? []).map((b) => ({
        ...b,
      })),
    };
    this.showAccountingForm = true;
  }

  cancelAccountingEdit() {
    this.showAccountingForm = false;
    this.accountingForm = { ...DEFAULT_ACCOUNTING_CONFIG };
  }

  addIgvRate() {
    this.accountingForm.igvRates.push({ tasa: 0, cuenta40: '' });
  }

  removeIgvRate(index: number) {
    this.accountingForm.igvRates.splice(index, 1);
  }

  addBankAccount() {
    const bank: IBankAccount = {
      banco: '',
      nroCuenta: '',
      cuentaContable: '',
      moneda: '01',
      cci: '',
      activo: true,
    };
    this.accountingForm.bankAccounts.push(bank);
  }

  removeBankAccount(index: number) {
    this.accountingForm.bankAccounts.splice(index, 1);
  }

  /** Convierte el textarea de palabras clave (una por línea) a array. */
  get inafectoKeywordsText(): string {
    return (this.accountingForm.inafectoKeywords ?? []).join('\n');
  }
  set inafectoKeywordsText(value: string) {
    this.accountingForm.inafectoKeywords = value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  saveAccountingConfig() {
    const clientId = this.getClientId();
    if (!clientId) {
      this.notificationService.show(
        'No se encontró companyId. Inicia sesión nuevamente.',
        'error'
      );
      return;
    }
    // Validación mínima de cuentas fijas.
    if (
      !this.accountingForm.cuenta42?.trim() ||
      !this.accountingForm.cuenta79?.trim() ||
      !this.accountingForm.cuenta14Raiz?.trim()
    ) {
      this.notificationService.show(
        'Las cuentas 42, 79 y 14 son obligatorias',
        'error'
      );
      return;
    }
    this.isSavingAccounting = true;
    this.accountingConfigService
      .saveConfig(clientId, this.accountingForm)
      .subscribe({
        next: (config) => {
          this.accountingConfig = config;
          this.isSavingAccounting = false;
          this.showAccountingForm = false;
          this.notificationService.show(
            'Configuración contable guardada correctamente',
            'success'
          );
        },
        error: (error: HttpErrorResponse) => {
          this.isSavingAccounting = false;
          this.notificationService.show(
            'Error al guardar la configuración contable: ' + error.message,
            'error'
          );
        },
      });
  }

  testSunatConnection() {
    const clientId = this.getClientId();
    if (!clientId) {
      this.notificationService.show(
        'No se encontró companyId. Inicia sesión nuevamente.',
        'error'
      );
      return;
    }
    this.invoicesService.testSunatCredentials(clientId).subscribe({
      next: (result) => {
        this.loadSunatConfig();
        if (result.success) {
          this.notificationService.show(
            'Conexión SUNAT exitosa: ' + result.message,
            'success'
          );
        } else {
          this.notificationService.show(
            'Error en conexión SUNAT: ' + result.message,
            'error'
          );
        }
      },
      error: (error: HttpErrorResponse) => {
        this.notificationService.show(
          'Error al probar conexión SUNAT: ' + error.message,
          'error'
        );
      },
    });
  }
}
