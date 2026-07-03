import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { UserStateService } from '../../services/user-state.service';
import { SaldoService } from '../../services/saldo.service';
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  private authService = inject(AuthService);
  private confirmationService = inject(ConfirmationService);
  private userStateService = inject(UserStateService);
  saldoService = inject(SaldoService);

  ngOnInit(): void {
    if (this.isColaborador()) {
      this.saldoService.refreshTotal();
    }
  }

  isColaborador(): boolean {
    return this.userStateService.isColaborador();
  }

  logout() {
    this.confirmationService.show(
      '¿Estás seguro de querer cerrar sesión?',
      () => {
        this.authService.logout();
      }
    );
  }
}
