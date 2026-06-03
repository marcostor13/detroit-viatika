import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { InvoicesService } from './invoices.service';
import { environment } from '../../../../environments/environment';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let httpMock: HttpTestingController;

  const EXP = `${environment.api}/expense`;
  const CAT = `${environment.api}/category`;
  const PRJ = `${environment.api}/project`;
  const CLI = `${environment.api}/client`;
  const SUB = `${environment.api}/sunat-config`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [InvoicesService],
    });
    service = TestBed.inject(InvoicesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('analyzeInvoice sends POST to /analyze-image', () => {
    service.analyzeInvoice({ imageUrl: 'http://x' } as any).subscribe();
    const req = httpMock.expectOne(`${EXP}/analyze-image`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('analyzePdf sends POST to /analize-pdf', () => {
    service.analyzePdf(new FormData()).subscribe();
    const req = httpMock.expectOne(`${EXP}/analize-pdf`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('getInvoices sends GET with pagination params', () => {
    service.getInvoices(null, 'fechaEmision', 'desc', 2, 10).subscribe();
    const req = httpMock.expectOne((r) => r.url === EXP);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('10');
    expect(req.request.params.get('sortBy')).toBe('fechaEmision');
    req.flush({ data: [], total: 0 });
  });

  it('getStatusCounts sends GET to /stats', () => {
    service.getStatusCounts().subscribe();
    httpMock.expectOne(`${EXP}/stats`).flush({ pending: 0, approved: 0, rejected: 0, total: 0 });
  });

  it('getInvoiceById sends GET by id', () => {
    service.getInvoiceById('i1').subscribe();
    httpMock.expectOne(`${EXP}/invoice/i1`).flush({});
  });

  it('uploadInvoice sends POST to /upload', () => {
    service.uploadInvoice(new FormData()).subscribe();
    const req = httpMock.expectOne(`${EXP}/upload`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('deleteInvoice sends DELETE by id', () => {
    service.deleteInvoice('i1').subscribe();
    const req = httpMock.expectOne(`${EXP}/invoice/i1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('approveInvoice sends PATCH to /approve', () => {
    service.approveInvoice('i1', { comment: 'ok' } as any).subscribe();
    httpMock.expectOne(`${EXP}/invoice/i1/approve`).flush({});
  });

  it('rejectInvoice sends PATCH to /reject', () => {
    service.rejectInvoice('i1', { reason: 'no' } as any).subscribe();
    httpMock.expectOne(`${EXP}/invoice/i1/reject`).flush({});
  });

  it('updateInvoice sends PATCH by id', () => {
    service.updateInvoice('i1', { amount: 100 }).subscribe();
    httpMock.expectOne(`${EXP}/invoice/i1`).flush({});
  });

  it('getCategories sends GET to /flat', () => {
    service.getCategories().subscribe();
    httpMock.expectOne(`${CAT}/flat`).flush([]);
  });

  it('getCategories with companyId sends GET to /:companyId/flat', () => {
    service.getCategories('c1').subscribe();
    httpMock.expectOne(`${CAT}/c1/flat`).flush([]);
  });

  it('getCategoryById sends GET by id', () => {
    service.getCategoryById('cat1').subscribe();
    httpMock.expectOne(`${CAT}/cat1`).flush({});
  });

  it('createCategory sends POST', () => {
    service.createCategory({ name: 'Travel' } as any).subscribe();
    httpMock.expectOne(CAT).flush({});
  });

  it('updateCategory sends PATCH by id and clientId', () => {
    service.updateCategory('cat1', 'c1', { name: 'New' }).subscribe();
    httpMock.expectOne(`${CAT}/cat1/c1`).flush({});
  });

  it('deleteCategory sends DELETE by id and clientId', () => {
    service.deleteCategory('cat1', 'c1').subscribe();
    httpMock.expectOne(`${CAT}/cat1/c1`).flush({});
  });

  it('getProjects sends GET', () => {
    service.getProjects().subscribe();
    httpMock.expectOne(PRJ).flush([]);
  });

  it('getProjects with companyId sends GET to /:companyId', () => {
    service.getProjects('c1').subscribe();
    httpMock.expectOne(`${PRJ}/c1`).flush([]);
  });

  it('createProject sends POST', () => {
    service.createProject({ name: 'P1' } as any).subscribe();
    httpMock.expectOne(PRJ).flush({});
  });

  it('updateProject sends PATCH by id and companyId', () => {
    service.updateProject('p1', { name: 'New' }, 'c1').subscribe();
    httpMock.expectOne(`${PRJ}/p1/c1`).flush({});
  });

  it('deleteProject sends DELETE by id and companyId', () => {
    service.deleteProject('p1', 'c1').subscribe();
    httpMock.expectOne(`${PRJ}/p1/c1`).flush({});
  });

  it('getCompanyConfig sends GET and maps response', () => {
    let result: any;
    service.getCompanyConfig('c1').subscribe(r => result = r);
    httpMock.expectOne(`${CLI}/c1`).flush({
      _id: 'c1', comercialName: 'Acme', businessId: 'ruc123', logo: null, limits: {}
    });
    expect(result.name).toBe('Acme');
    expect(result.companyId).toBe('c1');
  });

  it('updateCompanyConfig sends PATCH and maps response', () => {
    let result: any;
    service.updateCompanyConfig('c1', { name: 'New Name' }).subscribe(r => result = r);
    httpMock.expectOne(`${CLI}/c1`).flush({
      _id: 'c1', comercialName: 'New Name', logo: null, limits: {}
    });
    expect(result.name).toBe('New Name');
  });

  it('getSunatConfig sends GET by clientId', () => {
    service.getSunatConfig('c1').subscribe();
    httpMock.expectOne(`${SUB}/c1`).flush({});
  });

  it('createSunatConfig sends POST with clientId merged', () => {
    service.createSunatConfig('c1', { rucEmisor: '20123' } as any).subscribe();
    const req = httpMock.expectOne(SUB);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.clientId).toBe('c1');
    req.flush({});
  });

  it('updateSunatConfig throws synchronously when _id is missing', () => {
    expect(() => service.updateSunatConfig({} as any)).toThrowError(/Se requiere _id/);
  });

  it('updateSunatConfig sends PATCH when _id is provided', () => {
    service.updateSunatConfig({ _id: 's1', rucEmisor: '20123' } as any).subscribe();
    httpMock.expectOne(`${SUB}/s1`).flush({});
  });

  it('deleteSunatConfig sends DELETE by id', () => {
    service.deleteSunatConfig('s1').subscribe();
    httpMock.expectOne(`${SUB}/s1`).flush({});
  });

  it('getSunatCredentials sends GET to /credentials/:clientId', () => {
    service.getSunatCredentials('c1').subscribe();
    httpMock.expectOne(`${SUB}/credentials/c1`).flush({});
  });

  it('testSunatCredentials sends GET', () => {
    service.testSunatCredentials('c1').subscribe();
    httpMock.expectOne(`${EXP}/test-sunat-credentials/c1`).flush({});
  });

  it('createMobilitySheet sends POST to /mobility-sheet', () => {
    service.createMobilitySheet({ rows: [] } as any).subscribe();
    httpMock.expectOne(`${EXP}/mobility-sheet`).flush({});
  });

  it('createOtherExpense sends POST to /other-expense', () => {
    service.createOtherExpense({ description: 'taxi' } as any).subscribe();
    httpMock.expectOne(`${EXP}/other-expense`).flush({});
  });

  it('createCashReceipt sends POST to /cash-receipt', () => {
    service.createCashReceipt({ amount: 50 } as any).subscribe();
    httpMock.expectOne(`${EXP}/cash-receipt`).flush({});
  });

  it('createCashVoucher sends POST to /cash-voucher', () => {
    service.createCashVoucher({ amount: 30 } as any).subscribe();
    httpMock.expectOne(`${EXP}/cash-voucher`).flush({});
  });

  it('validateWithSunatData sends POST to /validate-sunat', () => {
    const data = { rucEmisor: '20', serie: 'F001', correlativo: '001', fechaEmision: '2026-01-01' };
    service.validateWithSunatData('i1', data).subscribe();
    httpMock.expectOne(`${EXP}/invoice/i1/validate-sunat`).flush({});
  });

  it('bulkImportProjects sends POST with FormData', () => {
    service.bulkImportProjects(new FormData()).subscribe();
    httpMock.expectOne(`${PRJ}/bulk-import`).flush({ created: 1, skipped: [], errors: [] });
  });

  it('downloadProjectTemplate sends GET to /bulk-import/template', () => {
    service.downloadProjectTemplate().subscribe();
    httpMock.expectOne(`${PRJ}/bulk-import/template`).flush({ file: 'b64', filename: 'template.xlsx' });
  });

  it('getProjectsPaginated sends GET with page, limit, and optional search', () => {
    service.getProjectsPaginated('c1', 1, 10, 'alpha').subscribe();
    const req = httpMock.expectOne((r) => r.url === `${PRJ}/c1`);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('search')).toBe('alpha');
    req.flush({ data: [], total: 0 });
  });
});
