import { Component } from '@angular/core';
import { ShowService } from '../../services/show.service';
import { IMessageResponse } from '../../interfaces/message.interface';
@Component({
  selector: 'app-show',
  standalone: true,
  imports: [],
  templateUrl: './show.component.html',
  styleUrl: './show.component.scss',
})
export class ShowComponent {
  message: IMessageResponse = {} as IMessageResponse;

  constructor(private showService: ShowService) {
    this.showService.message$.subscribe((message) => {
      this.message = message;
    });
  }

  close() {
    this.showService.hide();
  }
}
