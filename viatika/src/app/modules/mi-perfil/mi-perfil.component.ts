import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NotificationService } from '../../services/notification.service';
import { UserStateService } from '../../services/user-state.service';
import { UploadService } from '../../services/upload.service';
import { ButtonComponent } from '../../design-system/button/button.component';
import {
  SearchSelectComponent,
  SearchSelectOption,
} from '../../design-system/search-select/search-select.component';
import { environment } from '../../../environments/environment';
import {
  SuplenciaService,
  IMisSuplencias,
  IColaboradorBasico,
  IAprobadaEnReemplazo,
} from '../../services/suplencia.service';

@Component({
  selector: 'app-mi-perfil',
  templateUrl: './mi-perfil.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ButtonComponent, SearchSelectComponent],
})
export class MiPerfilComponent implements OnInit {
  private notificationService = inject(NotificationService);
  private userStateService = inject(UserStateService);
  private uploadService = inject(UploadService);
  private suplenciaService = inject(SuplenciaService);
  private http = inject(HttpClient);

  get currentUser() { return this.userStateService.getUser(); }

  // Profile edit
  showProfileForm = false;
  profileName = '';
  profilePicFile: File | null = null;
  profilePicPreview: string | null = null;
  isUploadingProfilePic = false;
  profilePicUploadProgress = 0;
  isSavingProfile = false;

  // Password
  showPasswordForm = false;
  newPassword = '';
  confirmPassword = '';
  isSavingPassword = false;

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

  // --- Vacaciones y suplente (VD-124) ---
  //
  // No hay nada que asignar documento por documento: mientras dure el período,
  // el backend deja que el suplente firme con la identidad del titular. Por eso
  // el formulario es solo período + persona, y cubre lo ya enviado igual que lo
  // que llegue después.

  misSuplencias: IMisSuplencias | null = null;
  colaboradores: IColaboradorBasico[] = [];
  showVacacionesForm = false;
  vacDesde = '';
  vacHasta = '';
  vacSuplenteId = '';
  isSavingVacaciones = false;
  isLoadingSuplencias = true;

  /**
   * Historial de lo que firmó cubriendo a otro. Va aquí y no en la bandeja a
   * proposito: la bandeja lista lo PENDIENTE y se vacia cuando termina la
   * vacacion. El historial sale de `approvedOnBehalfOf`, grabado en cada
   * documento, asi que sigue disponible despues.
   */
  aprobadasEnReemplazo: IAprobadaEnReemplazo[] = [];
  isLoadingHistorial = true;

  ngOnInit() {
    this.cargarSuplencias();
    this.suplenciaService.getAprobadasEnReemplazo().subscribe({
      next: (lista) => {
        this.aprobadasEnReemplazo = lista ?? [];
        this.isLoadingHistorial = false;
      },
      error: () => {
        this.isLoadingHistorial = false;
      },
    });
  }

  /** Nombre del colaborador que rindió, para la fila del historial. */
  colaboradorDe(r: IAprobadaEnReemplazo): string {
    const u = r.userId;
    return (typeof u === 'object' ? u?.name : '') || '—';
  }

  private cargarSuplencias() {
    this.isLoadingSuplencias = true;
    this.suplenciaService.getMisSuplencias().subscribe({
      next: (data) => {
        this.misSuplencias = data;
        this.isLoadingSuplencias = false;
      },
      error: () => {
        this.isLoadingSuplencias = false;
      },
    });
  }

  /** Opciones del selector de suplente: cualquiera menos uno mismo. */
  get opcionesSuplente(): SearchSelectOption[] {
    const yo = this.currentUser?._id;
    return this.colaboradores
      .filter((c) => c._id !== yo)
      .map((c) => ({ value: c._id, label: c.name, subLabel: c.email }));
  }

  get nombreSuplenteActual(): string {
    const vac = this.misSuplencias?.vacaciones;
    if (!vac) return '';
    // El backend ya lo resuelve; la lista de colaboradores es solo el respaldo
    // para cuando el formulario está abierto y se acaba de elegir a alguien.
    return (
      vac.suplenteName ||
      this.colaboradores.find((c) => c._id === vac.suplenteId)?.name ||
      'otro usuario'
    );
  }

  /** `YYYY-MM-DD` de una fecha que puede venir como ISO completo del backend. */
  private soloFecha(valor: string | undefined): string {
    return (valor || '').slice(0, 10);
  }

  editVacaciones() {
    const actual = this.misSuplencias?.vacaciones;
    this.vacDesde = this.soloFecha(actual?.desde);
    this.vacHasta = this.soloFecha(actual?.hasta);
    this.vacSuplenteId = actual?.suplenteId || '';
    this.showVacacionesForm = true;
    if (this.colaboradores.length === 0) {
      this.suplenciaService.getColaboradores().subscribe({
        next: (lista) => { this.colaboradores = lista; },
        error: () => {
          this.notificationService.show('No se pudo cargar la lista de colaboradores', 'error');
        },
      });
    }
  }

  cancelVacacionesEdit() {
    this.showVacacionesForm = false;
    this.vacDesde = '';
    this.vacHasta = '';
    this.vacSuplenteId = '';
  }

  saveVacaciones() {
    if (!this.vacDesde || !this.vacHasta) {
      this.notificationService.show('Indica desde y hasta cuándo estarás de vacaciones', 'error');
      return;
    }
    if (this.vacHasta < this.vacDesde) {
      this.notificationService.show('La fecha de fin no puede ser anterior a la de inicio', 'error');
      return;
    }
    if (!this.vacSuplenteId) {
      this.notificationService.show('Elige quién te reemplazará', 'error');
      return;
    }
    this.isSavingVacaciones = true;
    this.suplenciaService.setMisVacaciones({
      desde: this.vacDesde,
      hasta: this.vacHasta,
      suplenteId: this.vacSuplenteId,
    }).subscribe({
      next: () => {
        this.isSavingVacaciones = false;
        this.notificationService.show('Vacaciones programadas correctamente', 'success');
        this.cancelVacacionesEdit();
        this.cargarSuplencias();
      },
      error: (err) => {
        this.isSavingVacaciones = false;
        this.notificationService.show(
          err?.error?.message || 'Error al programar las vacaciones',
          'error'
        );
      },
    });
  }

  /** Vuelta anticipada: el titular retoma sus aprobaciones de inmediato. */
  borrarVacaciones() {
    this.isSavingVacaciones = true;
    this.suplenciaService.borrarMisVacaciones().subscribe({
      next: () => {
        this.isSavingVacaciones = false;
        this.notificationService.show('Se canceló el período de vacaciones', 'success');
        this.cargarSuplencias();
      },
      error: () => {
        this.isSavingVacaciones = false;
        this.notificationService.show('Error al cancelar las vacaciones', 'error');
      },
    });
  }
}
