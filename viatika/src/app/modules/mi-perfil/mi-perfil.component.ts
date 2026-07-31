import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { NotificationService } from '../../services/notification.service';
import { UserStateService } from '../../services/user-state.service';
import { UploadService } from '../../services/upload.service';
import { ButtonComponent } from '../../design-system/button/button.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-mi-perfil',
  templateUrl: './mi-perfil.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
})
export class MiPerfilComponent {
  private notificationService = inject(NotificationService);
  private userStateService = inject(UserStateService);
  private uploadService = inject(UploadService);
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
}
