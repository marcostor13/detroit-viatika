import { Component, inject } from '@angular/core';
import { ConfirmationService } from '../../services/confirmation.service';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation.component.html',
  styleUrl: './confirmation.component.scss',
})
export class ConfirmationComponent {
  confirmationService = inject(ConfirmationService);
}
