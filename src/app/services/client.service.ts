import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { IClient } from '../interfaces/user.interface';

@Injectable({ providedIn: 'root' })
export class ClientService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.api}/client`;

    getClients(): Observable<IClient[]> {
        return this.http.get<IClient[]>(this.apiUrl);
    }

    createClient(client: Partial<IClient>): Observable<IClient> {
        return this.http.post<IClient>(this.apiUrl, client);
    }

    updateClient(id: string, client: Partial<IClient>): Observable<IClient> {
        return this.http.patch<IClient>(`${this.apiUrl}/${id}`, client);
    }

    deleteClient(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }
}
