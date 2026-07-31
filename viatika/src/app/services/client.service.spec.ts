import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ClientService } from './client.service';
import { environment } from '../../environments/environment';

describe('ClientService', () => {
  let service: ClientService;
  let httpMock: HttpTestingController;

  const API = `${environment.api}/client`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ClientService],
    });
    service = TestBed.inject(ClientService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getClients sends GET', () => {
    service.getClients().subscribe();
    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createClient sends POST with payload', () => {
    service.createClient({ businessName: 'Acme' }).subscribe();
    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ businessName: 'Acme' });
    req.flush({});
  });

  it('updateClient sends PATCH by id', () => {
    service.updateClient('c1', { businessName: 'New' }).subscribe();
    const req = httpMock.expectOne(`${API}/c1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('deleteClient sends DELETE by id', () => {
    service.deleteClient('c1').subscribe();
    const req = httpMock.expectOne(`${API}/c1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });
});
