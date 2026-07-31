import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UploadService } from './upload.service';
import { environment } from '../../environments/environment';

const PRESIGNED_URL_ENDPOINT = `${environment.api}/upload/presigned-url`;
const PRESIGNED_RESPONSE = {
  presignedUrl: 'https://test-bucket.s3.amazonaws.com/123-file.jpg?sig=xxx',
  fileUrl: 'https://test-bucket.s3.amazonaws.com/123-file.jpg',
};

describe('UploadService', () => {
  let service: UploadService;
  let httpMock: HttpTestingController;
  let origXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    origXHR = window.XMLHttpRequest;
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UploadService],
    });
    service = TestBed.inject(UploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    window.XMLHttpRequest = origXHR;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // upload()
  // ---------------------------------------------------------------------------
  describe('upload()', () => {
    it('requests presigned URL then PUTs file directly to S3 via fetch', (done) => {
      const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
      const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 200 }));

      service.upload(file).subscribe(res => {
        expect(res.url).toBe(PRESIGNED_RESPONSE.fileUrl);
        expect(fetchSpy).toHaveBeenCalledWith(
          PRESIGNED_RESPONSE.presignedUrl,
          jasmine.objectContaining({ method: 'PUT', body: file }),
        );
        done();
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('filename')).toBe('photo.jpg');
      expect(req.request.params.get('contentType')).toBe('image/jpeg');
      req.flush(PRESIGNED_RESPONSE);
    });

    it('defaults contentType to application/octet-stream when file has no type', (done) => {
      const file = new File(['x'], 'data.bin', { type: '' });
      spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 200 }));

      service.upload(file).subscribe(() => done());

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      expect(req.request.params.get('contentType')).toBe('application/octet-stream');
      req.flush(PRESIGNED_RESPONSE);
    });

    it('errors when fetch fails', (done) => {
      const file = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      spyOn(window, 'fetch').and.rejectWith(new TypeError('network error'));

      service.upload(file).subscribe({
        error: (err) => {
          expect(err.message).toContain('network error');
          done();
        },
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      req.flush(PRESIGNED_RESPONSE);
    });

    it('errors when presigned URL request fails', (done) => {
      const file = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      spyOn(window, 'fetch');

      service.upload(file).subscribe({
        error: (err) => {
          expect(err.status).toBe(500);
          done();
        },
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      req.flush({ message: 'server error' }, { status: 500, statusText: 'Internal Server Error' });
    });
  });

  // ---------------------------------------------------------------------------
  // uploadFile()
  // ---------------------------------------------------------------------------
  describe('uploadFile()', () => {
    function makeXhrMock(status = 200): any {
      return {
        abort: jasmine.createSpy('abort'),
        open: jasmine.createSpy('open'),
        send: jasmine.createSpy('send'),
        setRequestHeader: jasmine.createSpy('setRequestHeader'),
        upload: { onprogress: undefined as any },
        onload: undefined as any,
        onerror: undefined as any,
        status,
      };
    }

    function installXhrMock(xhrMock: any): void {
      (window as any).XMLHttpRequest = function () { return xhrMock; };
    }

    it('returns uploadProgress$ and downloadUrl$ observables', (done) => {
      const xhrMock = makeXhrMock();
      installXhrMock(xhrMock);

      const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
      const { uploadProgress$, downloadUrl$ } = service.uploadFile(file, 'some/path');

      const progressValues: number[] = [];
      uploadProgress$.subscribe(p => progressValues.push(p));

      downloadUrl$.subscribe(url => {
        expect(url).toBe(PRESIGNED_RESPONSE.fileUrl);
        expect(progressValues).toContain(50);
        expect(xhrMock.open).toHaveBeenCalledWith('PUT', PRESIGNED_RESPONSE.presignedUrl, true);
        expect(xhrMock.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
        expect(xhrMock.send).toHaveBeenCalledWith(file);
        done();
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      expect(req.request.params.get('filename')).toBe('photo.jpg');
      expect(req.request.params.get('contentType')).toBe('image/jpeg');
      req.flush(PRESIGNED_RESPONSE);

      xhrMock.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
      xhrMock.onload();
    });

    it('reports multiple progress events', (done) => {
      const xhrMock = makeXhrMock();
      installXhrMock(xhrMock);

      const file = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      const { uploadProgress$, downloadUrl$ } = service.uploadFile(file, '');

      const progressValues: number[] = [];
      uploadProgress$.subscribe(p => progressValues.push(p));
      downloadUrl$.subscribe(() => {
        expect(progressValues).toEqual([25, 75, 100]);
        done();
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      req.flush(PRESIGNED_RESPONSE);

      xhrMock.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
      xhrMock.upload.onprogress({ lengthComputable: true, loaded: 75, total: 100 });
      xhrMock.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
      xhrMock.onload();
    });

    it('skips progress events when total is not computable', (done) => {
      const xhrMock = makeXhrMock();
      installXhrMock(xhrMock);

      const file = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      const { uploadProgress$, downloadUrl$ } = service.uploadFile(file, '');

      const progressValues: number[] = [];
      uploadProgress$.subscribe(p => progressValues.push(p));
      downloadUrl$.subscribe(() => {
        expect(progressValues.length).toBe(0);
        done();
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      req.flush(PRESIGNED_RESPONSE);

      xhrMock.upload.onprogress({ lengthComputable: false, loaded: 50, total: 0 });
      xhrMock.onload();
    });

    it('defaults contentType to application/octet-stream when file has no type', (done) => {
      const xhrMock = makeXhrMock();
      installXhrMock(xhrMock);

      const file = new File(['x'], 'data.bin', { type: '' });
      const { downloadUrl$ } = service.uploadFile(file, '');

      downloadUrl$.subscribe(() => {
        expect(xhrMock.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
        done();
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      expect(req.request.params.get('contentType')).toBe('application/octet-stream');
      req.flush(PRESIGNED_RESPONSE);
      xhrMock.onload();
    });

    it('emits error when XHR responds with non-2xx status', (done) => {
      const xhrMock = makeXhrMock(403);
      installXhrMock(xhrMock);

      const file = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      const { downloadUrl$ } = service.uploadFile(file, '');

      downloadUrl$.subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('403');
          done();
        },
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      req.flush(PRESIGNED_RESPONSE);
      xhrMock.onload();
    });

    it('emits error when XHR has a network error', (done) => {
      const xhrMock = makeXhrMock();
      installXhrMock(xhrMock);

      const file = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      const { downloadUrl$ } = service.uploadFile(file, '');

      downloadUrl$.subscribe({
        error: (err: Error) => {
          expect(err.message).toBeTruthy();
          done();
        },
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      req.flush(PRESIGNED_RESPONSE);
      xhrMock.onerror();
    });

    it('emits error when presigned URL request fails', (done) => {
      const xhrMock = makeXhrMock();
      installXhrMock(xhrMock);

      const file = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      const { downloadUrl$ } = service.uploadFile(file, '');

      downloadUrl$.subscribe({
        error: (err) => {
          expect(err.status).toBe(401);
          done();
        },
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    });

    it('downloadUrl$ only subscriber still works without uploadProgress$ subscriber', (done) => {
      const xhrMock = makeXhrMock();
      installXhrMock(xhrMock);

      const file = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      const { downloadUrl$ } = service.uploadFile(file, '');

      downloadUrl$.subscribe(url => {
        expect(url).toBe(PRESIGNED_RESPONSE.fileUrl);
        done();
      });

      const req = httpMock.expectOne(r => r.url.includes('/upload/presigned-url'));
      req.flush(PRESIGNED_RESPONSE);
      xhrMock.onload();
    });
  });
});
