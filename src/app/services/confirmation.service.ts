import { Injectable, signal } from '@angular/core';

export interface ConfirmationOptions {
  title?: string;
  message: string;
  accept: () => void;
  reject?: () => void;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmationService {
  private _title = signal<string>('Confirmación');
  private _message = signal<string>('');
  private _visible = signal<boolean>(false);
  private _acceptCallback = signal<() => void>(() => {});
  private _rejectCallback = signal<() => void>(() => {});

  title = this._title.asReadonly();
  message = this._message.asReadonly();
  visible = this._visible.asReadonly();
  acceptCallback = this._acceptCallback.asReadonly();
  rejectCallback = this._rejectCallback.asReadonly();

  show(message: string, callback: () => void) {
    this._title.set('Confirmación');
    this._message.set(message);
    this._acceptCallback.set(callback);
    this._rejectCallback.set(() => {});
    this._visible.set(true);
  }

  confirm(options: ConfirmationOptions) {
    this._title.set(options.title || 'Confirmación');
    this._message.set(options.message);
    this._acceptCallback.set(options.accept);
    this._rejectCallback.set(options.reject || (() => {}));
    this._visible.set(true);
  }

  hide() {
    this._visible.set(false);
    this._message.set('');
    this._title.set('Confirmación');
    this._acceptCallback.set(() => {});
    this._rejectCallback.set(() => {});
  }

  accept() {
    this.acceptCallback()();
    this.hide();
  }

  reject() {
    this.rejectCallback()();
    this.hide();
  }

  cancel() {
    this.hide();
  }
}
