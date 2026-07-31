import { Injectable } from '@angular/core';
import { Observable, from, switchMap, map, filter, share } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface PresignedUrlResponse {
  presignedUrl: string;
  fileUrl: string;
}

interface UploadResponse {
  url: string;
}

type UploadEvent =
  | { type: 'progress'; value: number }
  | { type: 'done'; url: string };

@Injectable({
  providedIn: 'root',
})
export class UploadService {
  private readonly baseUrl = environment.api;

  constructor(private readonly http: HttpClient) {}

  private getPresignedUrl(file: File): Observable<PresignedUrlResponse> {
    return this.http.get<PresignedUrlResponse>(`${this.baseUrl}/upload/presigned-url`, {
      params: {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
      },
    });
  }

  /** Sube un archivo con XHR directo a S3 emitiendo progreso y URL final. */
  private xhrUpload(presignedUrl: string, fileUrl: string, file: File): Observable<UploadEvent> {
    return new Observable<UploadEvent>((observer) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignedUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          observer.next({ type: 'progress', value: Math.round((100 * e.loaded) / e.total) });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          observer.next({ type: 'done', url: fileUrl });
          observer.complete();
        } else {
          observer.error(new Error(`Error al subir a S3: ${xhr.status}`));
        }
      };

      xhr.onerror = () => observer.error(new Error('Error de red al subir el archivo'));

      xhr.send(file);

      return () => xhr.abort();
    });
  }

  upload(file: File, _resourceType: string = 'image'): Observable<UploadResponse> {
    return this.getPresignedUrl(file).pipe(
      switchMap(({ presignedUrl, fileUrl }) =>
        from(
          fetch(presignedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          })
        ).pipe(map(() => ({ url: fileUrl })))
      )
    );
  }

  uploadFile(
    file: File,
    _path: string
  ): { uploadProgress$: Observable<number>; downloadUrl$: Observable<string> } {
    const upload$: Observable<UploadEvent> = this.getPresignedUrl(file).pipe(
      switchMap(({ presignedUrl, fileUrl }) => this.xhrUpload(presignedUrl, fileUrl, file)),
      share(),
    );

    const uploadProgress$ = upload$.pipe(
      filter((e): e is { type: 'progress'; value: number } => e.type === 'progress'),
      map((e) => e.value),
    );

    const downloadUrl$ = upload$.pipe(
      filter((e): e is { type: 'done'; url: string } => e.type === 'done'),
      map((e) => e.url),
    );

    return { uploadProgress$, downloadUrl$ };
  }
}
