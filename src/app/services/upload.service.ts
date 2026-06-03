import { Injectable } from '@angular/core';
import { Observable, map, filter, share } from 'rxjs';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface UploadResponse {
  url: string;
}

@Injectable({
  providedIn: 'root',
})
export class UploadService {
  private readonly baseUrl = environment.api;

  constructor(private readonly http: HttpClient) {}

  upload(file: File, resourceType: string = 'image'): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('resourceType', resourceType);
    return this.http.post<UploadResponse>(`${this.baseUrl}/upload`, formData);
  }

  /**
   * Sube un archivo al backend (S3) con reporte de progreso.
   * Retorna observables de progreso y URL final.
   */
  uploadFile(
    file: File,
    _path: string
  ): { uploadProgress$: Observable<number>; downloadUrl$: Observable<string> } {
    const formData = new FormData();
    formData.append('file', file);

    const upload$ = this.http.post<UploadResponse>(
      `${this.baseUrl}/upload`,
      formData,
      {
        reportProgress: true,
        observe: 'events',
      }
    ).pipe(share());

    const uploadProgress$ = upload$.pipe(
      filter((event) => event.type === HttpEventType.UploadProgress),
      map((event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          return Math.round((100 * event.loaded) / event.total);
        }
        return 0;
      })
    );

    const downloadUrl$ = upload$.pipe(
      filter(
        (event) =>
          event.type === HttpEventType.Response && !!event.body
      ),
      map((event) => (event as { body: UploadResponse }).body.url)
    );

    return { uploadProgress$, downloadUrl$ };
  }
}
