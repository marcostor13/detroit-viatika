import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  private activeRequests = 0;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private loadingSubject = new BehaviorSubject<boolean>(false);
  readonly loading$ = this.loadingSubject.asObservable();

  show(): void {
    this.activeRequests++;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (!this.loadingSubject.value) {
      Promise.resolve().then(() => this.loadingSubject.next(true));
    }
  }

  hide(): void {
    if (this.activeRequests > 0) this.activeRequests--;
    if (this.activeRequests === 0) {
      this.hideTimer = setTimeout(() => {
        if (this.activeRequests === 0) {
          this.loadingSubject.next(false);
        }
        this.hideTimer = null;
      }, 200);
    }
  }

  isLoading(): boolean {
    return this.loadingSubject.value;
  }
}
