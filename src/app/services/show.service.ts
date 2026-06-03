import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { IMessageResponse } from '../interfaces/message.interface';
@Injectable({
  providedIn: 'root'
})
export class ShowService {
  private showSubject = new BehaviorSubject<boolean>(false);
  public show$ = this.showSubject.asObservable();

  private messageSubject = new BehaviorSubject<IMessageResponse>({} as IMessageResponse);
  public message$ = this.messageSubject.asObservable();

  show(message: IMessageResponse) {
    this.messageSubject.next(message);
    this.showSubject.next(true);
  }

  hide() {
    this.showSubject.next(false);
  }

  getMessage() {
    return this.messageSubject.getValue();
  }

  isShow() {
    return this.showSubject.getValue();
  }
}
