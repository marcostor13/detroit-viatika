import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ICategoryProfile } from '../interfaces/category-profile.interface';
import { UserStateService } from './user-state.service';

@Injectable({ providedIn: 'root' })
export class CategoryProfileService {
  private readonly baseUrl = `${environment.api}/category-profile`;
  private readonly http = inject(HttpClient);
  private readonly userState = inject(UserStateService);

  private get companyId(): string {
    return this.userState.getUser()?.companyId ?? '';
  }

  getAll(): Observable<ICategoryProfile[]> {
    return this.http.get<ICategoryProfile[]>(`${this.baseUrl}/${this.companyId}`);
  }

  create(dto: { name: string; categoryIds: string[] }): Observable<ICategoryProfile> {
    return this.http.post<ICategoryProfile>(this.baseUrl, {
      ...dto,
      clientId: this.companyId,
    });
  }

  update(id: string, dto: { name?: string; categoryIds?: string[] }): Observable<ICategoryProfile> {
    return this.http.patch<ICategoryProfile>(`${this.baseUrl}/${id}/${this.companyId}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/${this.companyId}`);
  }
}
