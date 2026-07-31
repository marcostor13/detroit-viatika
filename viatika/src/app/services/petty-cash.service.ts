import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserStateService } from './user-state.service';
import {
  IPettyCash,
  ICreatePettyCashPayload,
} from '../interfaces/petty-cash.interface';

@Injectable({ providedIn: 'root' })
export class PettyCashService {
  private readonly url = `${environment.api}/petty-cash`;
  private http = inject(HttpClient);
  private userStateService = inject(UserStateService);

  private get clientId(): string {
    const user = this.userStateService.getUser() as any;
    return user?.companyId || user?.client?._id || user?.clientId?._id || user?.clientId || '';
  }

  create(payload: ICreatePettyCashPayload): Observable<IPettyCash> {
    return this.http.post<IPettyCash>(this.url, payload);
  }

  findAllByClient(): Observable<IPettyCash[]> {
    return this.http.get<IPettyCash[]>(`${this.url}/client/${this.clientId}`);
  }

  findMine(): Observable<IPettyCash[]> {
    return this.http.get<IPettyCash[]>(`${this.url}/my/client/${this.clientId}`);
  }

  findOne(id: string): Observable<IPettyCash> {
    return this.http.get<IPettyCash>(`${this.url}/${id}`);
  }

  registerFunding(id: string, payload: {
    transferDate: string;
    amount: number;
    operationNumber: string;
    receiptUrl: string;
  }): Observable<IPettyCash> {
    return this.http.patch<IPettyCash>(`${this.url}/${id}/register-funding`, payload);
  }

  addExpense(id: string, expenseId: string, amount: number, category?: string): Observable<IPettyCash> {
    return this.http.patch<IPettyCash>(`${this.url}/${id}/add-expense`, { expenseId, amount, category });
  }

  close(id: string): Observable<IPettyCash> {
    return this.http.patch<IPettyCash>(`${this.url}/${id}/close`, {});
  }
}
