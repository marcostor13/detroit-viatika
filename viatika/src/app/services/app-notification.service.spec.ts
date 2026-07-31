import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AppNotificationService, AppNotification } from './app-notification.service';
import { environment } from '../../environments/environment';

describe('AppNotificationService', () => {
  let service: AppNotificationService;
  let httpMock: HttpTestingController;

  const API = `${environment.api}/notifications`;

  const mockNotif: AppNotification = {
    _id: 'n1', userId: 'u1', title: 'Test', message: 'msg',
    type: 'info', isRead: false, createdAt: '2026-01-01',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AppNotificationService],
    });
    service = TestBed.inject(AppNotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetchNotifications updates notifications and unreadCount signals', () => {
    service.fetchNotifications().subscribe(ns => expect(ns.length).toBe(1));
    httpMock.expectOne(API).flush([mockNotif]);
    expect(service.notifications()).toEqual([mockNotif]);
    expect(service.unreadCount()).toBe(1);
  });

  it('fetchNotifications handles null response gracefully', () => {
    service.fetchNotifications().subscribe(ns => expect(ns).toEqual([]));
    httpMock.expectOne(API).flush(null);
    expect(service.unreadCount()).toBe(0);
  });

  it('fetchUnreadCount updates unreadCount signal', () => {
    service.fetchUnreadCount().subscribe();
    httpMock.expectOne(`${API}/unread-count`).flush({ count: 5 });
    expect(service.unreadCount()).toBe(5);
  });

  it('markAsRead updates notification in list and decrements unreadCount', () => {
    service.notifications.set([mockNotif]);
    service.unreadCount.set(1);
    service.markAsRead('n1').subscribe();
    httpMock.expectOne(`${API}/n1/read`).flush({ ...mockNotif, isRead: true });
    expect(service.notifications()[0].isRead).toBeTrue();
    expect(service.unreadCount()).toBe(0);
  });

  it('markAllAsRead marks all notifications as read and resets unreadCount', () => {
    service.notifications.set([mockNotif, { ...mockNotif, _id: 'n2' }]);
    service.unreadCount.set(2);
    service.markAllAsRead().subscribe();
    httpMock.expectOne(`${API}/read-all`).flush({ modifiedCount: 2 });
    expect(service.notifications().every(n => n.isRead)).toBeTrue();
    expect(service.unreadCount()).toBe(0);
  });
});
