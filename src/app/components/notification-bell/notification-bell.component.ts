import { Component, OnInit, inject, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AppNotificationService, AppNotification } from '../../services/app-notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-bell.component.html'
})
export class NotificationBellComponent implements OnInit {
  private notificationService = inject(AppNotificationService);
  private router = inject(Router);
  private elementRef = inject(ElementRef);

  unreadCount = this.notificationService.unreadCount;
  notifications = this.notificationService.notifications;
  
  isOpen = signal(false);

  ngOnInit(): void {
    this.notificationService.fetchNotifications().subscribe();
    
    setInterval(() => {
      this.notificationService.fetchNotifications().subscribe();
    }, 60000); // Poll every minute
  }

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    const newOpenState = !this.isOpen();
    this.isOpen.set(newOpenState);
    if (newOpenState) {
      this.notificationService.fetchNotifications().subscribe();
    }
  }

  onNotificationClick(notif: AppNotification, event: Event) {
    event.stopPropagation();
    if (!notif.isRead) {
      this.notificationService.markAsRead(notif._id).subscribe();
    }
    this.isOpen.set(false);
    if (notif.actionUrl) {
      this.router.navigateByUrl(notif.actionUrl);
    }
  }

  markAllAsRead(event: Event) {
    event.stopPropagation();
    this.notificationService.markAllAsRead().subscribe();
  }

  viewAll(event: Event) {
    event.stopPropagation();
    this.isOpen.set(false);
    this.router.navigate(['/notificaciones']);
  }

  trackByFn(index: number, item: AppNotification) {
    return item._id;
  }
}
