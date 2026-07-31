import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { UserStateService } from './user-state.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private http = inject(HttpClient);
  private userStateService = inject(UserStateService);

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${environment.api}/auth/login`, { email, password });
  }

  selectClient(body: { hubToken?: string; email?: string; password?: string; clientId: string }): Observable<any> {
    return this.http.post(`${environment.api}/auth/select-client`, body);
  }

  getHubCompanies(): Observable<any[]> {
    const token = this.userStateService.getToken();
    return this.http.get<any[]>(`${environment.api}/auth/companies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  logout() {
    this.userStateService.clearUser();
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }
}
