import { TestBed } from '@angular/core/testing';
import { ListFiltersService } from './list-filters.service';

describe('ListFiltersService', () => {
  let service: ListFiltersService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ListFiltersService);
  });

  afterEach(() => sessionStorage.clear());

  it('devuelve vacío cuando la bandeja nunca guardó filtros', () => {
    expect(service.read('rendiciones-fondos')).toEqual({});
  });

  it('recuerda los filtros de una bandeja', () => {
    service.write('rendiciones-fondos', { filterStatus: 'En contabilidad' });
    expect(service.read('rendiciones-fondos')).toEqual({
      filterStatus: 'En contabilidad',
    });
  });

  /**
   * El caso real: se filtra, se entra a una rendición y al volver el
   * componente se crea de nuevo. Lo guardado tiene que sobrevivir a esa
   * segunda instancia, que es lo que hace `sessionStorage` frente a un campo
   * del componente.
   */
  it('sobrevive a una instancia nueva del servicio', () => {
    service.write('rendiciones-fondos', { filterStatus: 'En contabilidad' });
    expect(new ListFiltersService().read('rendiciones-fondos')).toEqual({
      filterStatus: 'En contabilidad',
    });
  });

  it('cada bandeja tiene sus propios filtros', () => {
    service.write('rendiciones-fondos', { filterStatus: 'En contabilidad' });
    service.write('rendiciones-caja-chica', { filterStatus: 'Aprobada' });
    expect(service.read('rendiciones-fondos')).toEqual({
      filterStatus: 'En contabilidad',
    });
    expect(service.read('rendiciones-caja-chica')).toEqual({
      filterStatus: 'Aprobada',
    });
  });

  it('write reemplaza, no mezcla con lo anterior', () => {
    service.write('bandeja', { filterStatus: 'Enviada', filterUserId: 'u1' });
    service.write('bandeja', { filterStatus: '', filterUserId: '' });
    expect(service.read('bandeja')).toEqual({ filterStatus: '', filterUserId: '' });
  });

  it('clear olvida una bandeja sin tocar las demás', () => {
    service.write('a', { filterStatus: 'x' });
    service.write('b', { filterStatus: 'y' });
    service.clear('a');
    expect(service.read('a')).toEqual({});
    expect(service.read('b')).toEqual({ filterStatus: 'y' });
  });

  // Al cerrar sesión: los ids de colaborador y centro de costo guardados son
  // del usuario que se va, y al siguiente le dejarían la lista vacía.
  it('clearAll olvida todas las bandejas', () => {
    service.write('a', { filterStatus: 'x' });
    service.write('b', { filterStatus: 'y' });
    service.clearAll();
    expect(service.read('a')).toEqual({});
    expect(new ListFiltersService().read('b')).toEqual({});
  });

  it('no deja tocar lo guardado por otras claves del sessionStorage', () => {
    sessionStorage.setItem('token', 'abc');
    service.write('a', { filterStatus: 'x' });
    service.clearAll();
    expect(sessionStorage.getItem('token')).toBe('abc');
  });

  it('ignora un valor corrupto en vez de romper la bandeja', () => {
    sessionStorage.setItem('viatika.filtros.rota', '{no es json');
    expect(new ListFiltersService().read('rota')).toEqual({});
  });
});
