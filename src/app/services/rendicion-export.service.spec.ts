import { TestBed } from '@angular/core/testing';
import {
  RendicionExportService,
  RendicionExportData,
  AffidavitExportData,
  MobilitySheetExportData,
  ReceiptExportData,
  SingleExpenseAffidavitData,
} from './rendicion-export.service';
import { CompanyConfigService } from './company-config.service';

const mockCompanyConfigService = jasmine.createSpyObj('CompanyConfigService', ['getCompanyConfig']);

const makeRendicionData = (): RendicionExportData => ({
  fileBaseName: 'test-rendicion',
  titulo: 'Rendición Test',
  estado: 'open',
  colaborador: 'Juan Pérez',
  presupuesto: 1000,
  totalGastado: 800,
  totalAnticipado: 500,
  saldoLibre: 200,
  fechaGeneracion: '01/01/2026',
  comprobantes: [],
  anticipos: [],
});

describe('RendicionExportService', () => {
  let service: RendicionExportService;

  beforeEach(() => {
    mockCompanyConfigService.getCompanyConfig.and.returnValue({
      _id: 'c1',
      companyId: 'c1',
      name: 'Test Co',
      businessName: 'Test Co SA',
      logo: '',
    });

    // Prevent blob URL creation for Excel downloads
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test-url');
    spyOn(URL, 'revokeObjectURL').and.returnValue(undefined);
    // Prevent network calls for logo fetch
    spyOn(window, 'fetch').and.returnValue(Promise.reject('no network in tests'));
    // Prevent anchor click (Excel download trigger)
    spyOn(HTMLAnchorElement.prototype, 'click').and.returnValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        RendicionExportService,
        { provide: CompanyConfigService, useValue: mockCompanyConfigService },
      ],
    });

    service = TestBed.inject(RendicionExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ─── Async PDF methods ────────────────────────────────────────────────

  describe('exportAffidavitToPdf', () => {
    it('resolves for minimal data', async () => {
      const data: AffidavitExportData = {
        fileBaseName: 'afidavit-2026',
        tipo: 'viaticos_nacionales',
        empresaNombre: 'Empresa SA',
        empresaRuc: '20123456789',
        colaborador: 'Juan Pérez',
        fechaGeneracion: '01/01/2026',
        total: 500,
        rows: [],
      };
      await expectAsync(service.exportAffidavitToPdf(data)).toBeResolved();
    });

    it('resolves when rows array is populated', async () => {
      const data: AffidavitExportData = {
        fileBaseName: 'afidavit',
        tipo: 'viajes_exterior',
        empresaNombre: 'Co SA',
        empresaRuc: '20000000001',
        colaborador: 'María García',
        fechaGeneracion: '15/05/2026',
        total: 1200,
        rows: [
          { fecha: '01/05/2026', documento: 'FAC-001', concepto: 'Hotel', categoria: 'Alojamiento', monto: 600 },
          { fecha: '02/05/2026', documento: 'FAC-002', concepto: 'Taxi', categoria: 'Transporte', monto: 600 },
        ],
        signature: undefined,
      };
      await expectAsync(service.exportAffidavitToPdf(data)).toBeResolved();
    });
  });

  describe('exportReceiptToPdf', () => {
    it('resolves for full data', async () => {
      const data: ReceiptExportData = {
        fileBaseName: 'recibo-test',
        collaborator: 'Juan Pérez',
        collaboratorDni: '12345678',
        razonSocial: 'Proveedor SA',
        ruc: '20111111111',
        numeroDocumento: 'RC-001',
        concepto: 'Servicios de consultoría',
        fecha: '01/01/2026',
        monto: 250,
      };
      await expectAsync(service.exportReceiptToPdf(data)).toBeResolved();
    });

    it('resolves when optional fields are absent', async () => {
      const data: ReceiptExportData = {
        fileBaseName: 'recibo-minimal',
        collaborator: 'Ana López',
        razonSocial: 'Co',
        concepto: 'Gastos varios',
        fecha: '01/01/2026',
        monto: 100,
      };
      await expectAsync(service.exportReceiptToPdf(data)).toBeResolved();
    });
  });

  describe('exportSingleExpenseAffidavitToPdf', () => {
    it('resolves for minimal data', async () => {
      const data: SingleExpenseAffidavitData = {
        fileBaseName: 'single-dj-test',
        titulo: 'Declaración Jurada de Gastos',
        colaborador: 'Juan Pérez',
        colaboradorDni: '12345678',
        fechaGeneracion: '01/01/2026',
        total: 50,
      };
      await expectAsync(service.exportSingleExpenseAffidavitToPdf(data)).toBeResolved();
    });

    it('resolves with mobility rows', async () => {
      const data: SingleExpenseAffidavitData = {
        fileBaseName: 'single-mobility',
        titulo: 'DJ Movilidad',
        colaborador: 'Carlos',
        fechaGeneracion: '01/01/2026',
        total: 80,
        mobilityRows: [
          { fecha: '01/01', origen: 'Lima', destino: 'Callao', gestion: 'Reunión', total: 40 },
        ],
      };
      await expectAsync(service.exportSingleExpenseAffidavitToPdf(data)).toBeResolved();
    });
  });

  // ─── Other async PDF/Excel methods ────────────────────────────────────

  describe('exportToPdf', () => {
    it('resolves without throwing for minimal rendicion data', async () => {
      await expectAsync(service.exportToPdf(makeRendicionData())).toBeResolved();
    });

    it('resolves without throwing when comprobantes are present', async () => {
      const data: RendicionExportData = {
        ...makeRendicionData(),
        comprobantes: [
          { tipo: 'factura', fecha: '01/01/2026', descripcion: 'Hotel', monto: 400, estadoComprobante: 'approved', proveedor: 'Hoteles SA', numeroDocumento: 'FAC-001' },
        ],
        anticipos: [{ descripcion: 'Anticipo Enero', monto: 500, estado: 'paid', fechaSolicitud: '01/12/2025' }],
        settlement: { advanceTotal: 500, expenseTotal: 400, difference: 100, typeLabel: 'Devolución' },
      };
      await expectAsync(service.exportToPdf(data)).toBeResolved();
    });
  });

  describe('exportMobilitySheetToPdf', () => {
    it('resolves without throwing for empty rows', async () => {
      const data: MobilitySheetExportData = {
        fileBaseName: 'mobility-test',
        collaborator: 'Juan Pérez',
        collaboratorDni: '12345678',
        generatedAt: '01/01/2026',
        rows: [],
        total: 0,
      };
      await expectAsync(service.exportMobilitySheetToPdf(data)).toBeResolved();
    });

    it('resolves without throwing when rows are present', async () => {
      const data: MobilitySheetExportData = {
        fileBaseName: 'mobility-rows',
        collaborator: 'María',
        generatedAt: '01/01/2026',
        rows: [
          { fecha: '01/01', origen: 'Lima', destino: 'Miraflores', gestion: 'Gestión', total: 30 },
        ],
        total: 30,
      };
      await expectAsync(service.exportMobilitySheetToPdf(data)).toBeResolved();
    });
  });

  // ─── Excel methods ────────────────────────────────────────────────────

  describe('exportToExcel', () => {
    it('resolves without throwing for empty rendicion', async () => {
      await expectAsync(service.exportToExcel(makeRendicionData())).toBeResolved();
    });

    it('resolves without throwing when comprobantes are present', async () => {
      const data: RendicionExportData = {
        ...makeRendicionData(),
        comprobantes: [
          { tipo: 'factura', fecha: '01/01/2026', descripcion: 'Vuelo', monto: 800, estadoComprobante: 'approved' },
        ],
      };
      await expectAsync(service.exportToExcel(data)).toBeResolved();
    });
  });

  describe('exportMobilitySheetToExcel', () => {
    it('resolves without throwing for empty rows', async () => {
      const data: MobilitySheetExportData = {
        fileBaseName: 'mobility-excel',
        collaborator: 'Juan',
        generatedAt: '01/01/2026',
        rows: [],
        total: 0,
      };
      await expectAsync(service.exportMobilitySheetToExcel(data)).toBeResolved();
    });

    it('resolves without throwing with populated rows', async () => {
      const data: MobilitySheetExportData = {
        fileBaseName: 'mobility-excel-rows',
        collaborator: 'María García',
        collaboratorDni: '11111111',
        internalCode: 'MG-01',
        location: 'Lima',
        generatedAt: '01/01/2026',
        rows: [
          { fecha: '01/01', origen: 'A', destino: 'B', gestion: 'G', total: 25 },
          { fecha: '02/01', origen: 'B', destino: 'C', gestion: 'G', total: 30 },
        ],
        total: 55,
      };
      await expectAsync(service.exportMobilitySheetToExcel(data)).toBeResolved();
    });
  });
});
