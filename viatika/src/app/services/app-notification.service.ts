import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, map, tap } from 'rxjs';

export interface AppNotification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  isRead: boolean;
  actionUrl?: string;
  metadata?: any;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class AppNotificationService {
  private apiUrl = `${environment.api}/notifications`;

  // Signals for reactive state
  unreadCount = signal<number>(0);
  notifications = signal<AppNotification[]>([]);

  constructor(private http: HttpClient) {}

  fetchNotifications(): Observable<AppNotification[]> {
    return this.http.get<AppNotification[] | null>(this.apiUrl).pipe(
      map(notifs => (Array.isArray(notifs) ? notifs : [])),
      tap(notifs => {
        this.notifications.set(notifs);
        this.updateUnreadCount(notifs);
      })
    );
  }

  fetchUnreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.apiUrl}/unread-count`).pipe(
      tap(res => this.unreadCount.set(res.count))
    );
  }

  markAsRead(id: string): Observable<AppNotification> {
    return this.http.patch<AppNotification>(`${this.apiUrl}/${id}/read`, {}).pipe(
      tap(updatedNotif => {
        // Update local state
        const current = this.notifications();
        const updatedList = current.map(n => n._id === id ? { ...n, isRead: true } : n);
        this.notifications.set(updatedList);
        this.updateUnreadCount(updatedList);
      })
    );
  }

  markAllAsRead(): Observable<{ modifiedCount: number }> {
    return this.http.patch<{ modifiedCount: number }>(`${this.apiUrl}/read-all`, {}).pipe(
      tap(() => {
        const current = this.notifications();
        const updatedList = current.map(n => ({ ...n, isRead: true }));
        this.notifications.set(updatedList);
        this.unreadCount.set(0);
      })
    );
  }

  private updateUnreadCount(notifs: AppNotification[] | null | undefined) {
    const safeNotifs = Array.isArray(notifs) ? notifs : [];
    const count = safeNotifs.filter(n => !n.isRead).length;
    this.unreadCount.set(count);
  }
}
