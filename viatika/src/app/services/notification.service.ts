import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  message = new BehaviorSubject('');
  type = new BehaviorSubject<'success' | 'error' | 'warning'>('success');
  visible = new BehaviorSubject(false);

  show(message: string, type: 'success' | 'error' | 'warning' = 'success') {
    this.message.next(message);
    this.type.next(type);
    this.visible.next(true);

    setTimeout(() => this.hide(), 5000);
  }

  hide() {
    this.visible.next(false);
  }

  isVisible() {
    return this.visible.asObservable();
  }
}
