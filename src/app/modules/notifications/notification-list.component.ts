import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppNotificationService, AppNotification } from '../../services/app-notification.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-list.component.html'
})
export class NotificationListComponent implements OnInit {
  private notificationService = inject(AppNotificationService);
  private router = inject(Router);

  notifications = this.notificationService.notifications;

  ngOnInit() {
    this.notificationService.fetchNotifications().subscribe();
  }

  onNotificationClick(notif: AppNotification) {
    if (!notif.isRead) {
      this.notificationService.markAsRead(notif._id).subscribe();
    }
    if (notif.actionUrl) {
      this.router.navigateByUrl(notif.actionUrl);
    }
  }

  markAllAsRead() {
    this.notificationService.markAllAsRead().subscribe();
  }

  goBack() {
    this.router.navigate(['/']); // or to previous page
  }

  trackByFn(index: number, item: AppNotification) {
    return item._id;
  }
}
