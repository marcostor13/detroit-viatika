import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApproverLevelsComponent, ApproverLevelValue } from './approver-levels.component';

describe('ApproverLevelsComponent', () => {
  let fixture: ComponentFixture<ApproverLevelsComponent>;
  let component: ApproverLevelsComponent;

  const candidates = [
    { _id: 'u1', name: 'Ana', email: 'ana@acme.com' },
    { _id: 'u2', name: 'Luis', email: 'luis@acme.com' },
    { _id: 'u3', name: 'Marta', email: 'marta@acme.com' },
  ];

  function setLevels(levels: ApproverLevelValue[]) {
    fixture.componentRef.setInput('levels', levels);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ApproverLevelsComponent] });
    fixture = TestBed.createComponent(ApproverLevelsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('candidates', candidates);
    fixture.detectChanges();
  });

  it('ordena los niveles por número, no por orden de creación', () => {
    setLevels([
      { level: 3, userIds: ['u1'] },
      { level: 1, userIds: ['u2'] },
    ]);
    expect(component.sortedLevels().map((l) => l.level)).toEqual([1, 3]);
  });

  it('no muta el arreglo de entrada al agregar un aprobador: emite uno nuevo', () => {
    const levels: ApproverLevelValue[] = [{ level: 1, userIds: ['u1'] }];
    setLevels(levels);
    let emitted: ApproverLevelValue[] | undefined;
    component.levelsChange.subscribe((v) => (emitted = v));

    component.addApproverToLevel(levels[0], 'u2');

    expect(levels[0].userIds).toEqual(['u1']);
    expect(emitted).toEqual([{ level: 1, userIds: ['u1', 'u2'] }]);
  });

  it('quitar el último aprobador elimina el nivel completo (regla 1.6)', () => {
    setLevels([
      { level: 1, userIds: ['u1'] },
      { level: 2, userIds: ['u2'] },
    ]);
    let emitted: ApproverLevelValue[] | undefined;
    component.levelsChange.subscribe((v) => (emitted = v));

    component.removeApproverFromLevel({ level: 1, userIds: ['u1'] }, 'u1');

    expect(emitted).toEqual([{ level: 2, userIds: ['u2'] }]);
  });

  it('excluye a los usuarios vetados de los candidatos', () => {
    fixture.componentRef.setInput('excludedUserIds', ['u2']);
    fixture.detectChanges();
    expect(component.filteredNewLevelCandidates().map((u) => u._id)).toEqual(['u1', 'u3']);
    expect(component.candidatesForLevel({ level: 1, userIds: [] }).map((u) => u._id)).toEqual([
      'u1',
      'u3',
    ]);
  });

  it('filtra candidatos por nombre o correo', () => {
    component.newLevelSearch.set('marta');
    expect(component.filteredNewLevelCandidates().map((u) => u._id)).toEqual(['u3']);
    component.newLevelSearch.set('luis@acme');
    expect(component.filteredNewLevelCandidates().map((u) => u._id)).toEqual(['u2']);
  });

  it('sugiere el primer número de nivel libre', () => {
    setLevels([
      { level: 1, userIds: ['u1'] },
      { level: 3, userIds: ['u2'] },
    ]);
    component.startAddLevel();
    expect(component.newLevelNumber).toBe(2);
  });

  it('rechaza un nivel duplicado sin emitir cambios', () => {
    setLevels([{ level: 1, userIds: ['u1'] }]);
    const spy = jasmine.createSpy('levelsChange');
    component.levelsChange.subscribe(spy);

    component.startAddLevel();
    component.newLevelNumber = 1;
    component.toggleNewLevelUser('u2', true);
    component.confirmAddLevel();

    expect(spy).not.toHaveBeenCalled();
    expect(component.addError()).toContain('Ya existe un Nivel 1');
  });

  it('rechaza un nivel sin aprobadores', () => {
    const spy = jasmine.createSpy('levelsChange');
    component.levelsChange.subscribe(spy);

    component.startAddLevel();
    component.confirmAddLevel();

    expect(spy).not.toHaveBeenCalled();
    expect(component.addError()).toContain('al menos un aprobador');
  });

  it('agrega un nivel con varios aprobadores y cierra el formulario', () => {
    let emitted: ApproverLevelValue[] | undefined;
    component.levelsChange.subscribe((v) => (emitted = v));

    component.startAddLevel();
    component.newLevelNumber = 2;
    component.toggleNewLevelUser('u1', true);
    component.toggleNewLevelUser('u3', true);
    component.confirmAddLevel();

    expect(emitted).toEqual([{ level: 2, userIds: ['u1', 'u3'] }]);
    expect(component.addingLevel()).toBeFalse();
  });
});
