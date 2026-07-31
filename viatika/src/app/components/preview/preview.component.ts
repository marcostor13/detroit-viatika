import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IPreview } from '../../interfaces/preview.interface';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
})
export class PreviewComponent {
  message: string = '';
  @Input() dataPreview: IPreview = {} as IPreview;
  @Output() uploadEvent = new EventEmitter<string>();
  @Output() closeEvent = new EventEmitter<void>();

  close() {
    this.closeEvent.emit();
  }

  upload() {
    this.uploadEvent.emit(this.message);
  }
}
