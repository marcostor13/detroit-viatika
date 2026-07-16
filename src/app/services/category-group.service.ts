import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ICategoryGroup } from '../modules/categorias/interfaces/category-group.interface';
import { UserStateService } from './user-state.service';

@Injectable({ providedIn: 'root' })
export class CategoryGroupService {
  private readonly baseUrl = `${environment.api}/category-profile`;
  private readonly http = inject(HttpClient);
  private readonly userState = inject(UserStateService);

  private get companyId(): string {
    return this.userState.getUser()?.companyId ?? '';
  }

  getAll(): Observable<ICategoryGroup[]> {
    return this.http.get<ICategoryGroup[]>(`${this.baseUrl}/${this.companyId}`);
  }

  create(dto: { name: string; description?: string; categoryIds?: string[] }): Observable<ICategoryGroup> {
    return this.http.post<ICategoryGroup>(this.baseUrl, {
      ...dto,
      clientId: this.companyId,
    });
  }

  update(id: string, dto: { name?: string; description?: string; categoryIds?: string[] }): Observable<ICategoryGroup> {
    return this.http.patch<ICategoryGroup>(`${this.baseUrl}/${id}/${this.companyId}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/${this.companyId}`);
  }
}
