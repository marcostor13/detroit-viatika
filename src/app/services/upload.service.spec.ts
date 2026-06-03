import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpEventType } from '@angular/common/http';
import { UploadService } from './upload.service';
import { environment } from '../../environments/environment';

describe('UploadService', () => {
  let service: UploadService;
  let httpMock: HttpTestingController;

  const UPLOAD_URL = `${environment.api}/upload`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UploadService],
    });
    service = TestBed.inject(UploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('upload sends POST with FormData and default resourceType image', () => {
    const file = new File(['x'], 'test.jpg', { type: 'image/jpeg' });
    service.upload(file).subscribe(res => expect(res.url).toBe('http://cdn/test.jpg'));
    const req = httpMock.expectOne(UPLOAD_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect((req.request.body as FormData).get('resourceType')).toBe('image');
    req.flush({ url: 'http://cdn/test.jpg' });
  });

  it('upload uses custom resourceType', () => {
    const file = new File(['x'], 'f.pdf');
    service.upload(file, 'document').subscribe();
    const req = httpMock.expectOne(UPLOAD_URL);
    expect((req.request.body as FormData).get('resourceType')).toBe('document');
    req.flush({ url: 'http://cdn/f.pdf' });
  });

  it('uploadFile returns uploadProgress$ and downloadUrl$ observables', (done) => {
    const file = new File(['x'], 'f.jpg');
    const { uploadProgress$, downloadUrl$ } = service.uploadFile(file, 'some/path');

    const progressValues: number[] = [];
    uploadProgress$.subscribe(p => progressValues.push(p));

    downloadUrl$.subscribe(url => {
      expect(url).toBe('http://cdn/done.jpg');
      expect(progressValues).toContain(50);
      done();
    });

    const req = httpMock.expectOne(UPLOAD_URL);
    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 } as any);
    req.flush({ url: 'http://cdn/done.jpg' });
  });
});
