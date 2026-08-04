import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';
import { WorkerSelectComponent, WorkerOption } from '../worker-select/worker-select.component';

/**
 * Nivel de aprobación (identidad fija N1/N2/N3…) con sus aprobadores. Un nivel
 * puede tener varios: cualquiera de ellos completa ese paso y todos reciben la
 * notificación.
 */
export interface ApproverLevelValue {
  level: number;
  userIds: string[];
}

/**
 * Editor de niveles de aprobación, compartido por las dos fuentes de
 * aprobadores del sistema: los de un centro de costo
 * (`centros-de-costo-form`) y los propios del colaborador
 * (`user-permissions`, regla 1.10).
 *
 * Trabaja en modo controlado: nunca muta el arreglo recibido, emite uno nuevo
 * por `levelsChange` en cada cambio. El título y el texto de ayuda los pone la
 * pantalla anfitriona, porque cambian según la fuente.
 */
@Component({
  selector: 'app-approver-levels',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, IconComponent, WorkerSelectComponent],
  templateUrl: './approver-levels.component.html',
})
export class ApproverLevelsComponent {
  /** Niveles configurados actualmente. */
  levels = input<ApproverLevelValue[]>([]);
  /** Usuarios que pueden ser elegidos como aprobadores. */
  candidates = input<WorkerOption[]>([]);
  /** Texto del estado vacío. */
  emptyText = input<string>('Sin niveles de aprobación configurados.');
  /** Ids que no pueden elegirse como aprobadores (p. ej. el propio colaborador). */
  excludedUserIds = input<string[]>([]);

  levelsChange = output<ApproverLevelValue[]>();

  addingLevel = signal(false);
  newLevelNumber = 1;
  newLevelUserIds = signal<string[]>([]);
  newLevelSearch = signal('');
  /** Error de validación del formulario de nuevo nivel. */
  addError = signal('');

  /**
   * Valor transitorio del selector "Agregar aprobador" de cada nivel. Se
   * limpia tras elegir para volver a mostrar el placeholder.
   */
  approverPicker: Record<number, string> = {};

  sortedLevels = computed(() => [...this.levels()].sort((a, b) => a.level - b.level));

  /** Candidatos elegibles, sin los excluidos por la pantalla anfitriona. */
  private eligibleCandidates = computed(() => {
    const excluded = new Set(this.excludedUserIds());
    return this.candidates().filter((c) => !excluded.has(c._id));
  });

  candidatesForLevel(level: ApproverLevelValue): WorkerOption[] {
    return this.eligibleCandidates().filter((u) => !level.userIds.includes(u._id));
  }

  filteredNewLevelCandidates = computed(() => {
    const term = this.newLevelSearch().trim().toLowerCase();
    const list = this.eligibleCandidates();
    if (!term) return list;
    return list.filter((u) => `${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(term));
  });

  userLabel(id: string): string {
    const u = this.candidates().find((c) => c._id === id);
    if (!u) return id;
    return u.email ? `${u.name} (${u.email})` : (u.name ?? id);
  }

  private emit(next: ApproverLevelValue[]) {
    this.levelsChange.emit(next);
  }

  addApproverToLevel(target: ApproverLevelValue, userId: string) {
    if (!userId || target.userIds.includes(userId)) return;
    this.emit(
      this.levels().map((l) =>
        l.level === target.level ? { ...l, userIds: [...l.userIds, userId] } : l
      )
    );
  }

  onPickApprover(target: ApproverLevelValue, userId: string) {
    if (userId) this.addApproverToLevel(target, userId);
    // Se difiere al siguiente tick para forzar el writeValue('') del selector
    // y resetear su selección interna, permitiendo encadenar otro aprobador.
    this.approverPicker[target.level] = userId;
    setTimeout(() => {
      this.approverPicker[target.level] = '';
    });
  }

  /** Quitar el último aprobador de un nivel elimina el nivel (regla 1.6: un nivel vacío no existe). */
  removeApproverFromLevel(target: ApproverLevelValue, userId: string) {
    const remaining = target.userIds.filter((id) => id !== userId);
    if (remaining.length === 0) {
      this.removeLevel(target.level);
      return;
    }
    this.emit(
      this.levels().map((l) => (l.level === target.level ? { ...l, userIds: remaining } : l))
    );
  }

  removeLevel(levelNumber: number) {
    this.emit(this.levels().filter((l) => l.level !== levelNumber));
  }

  private nextSuggestedLevel(): number {
    const used = new Set(this.levels().map((l) => l.level));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  startAddLevel() {
    this.addingLevel.set(true);
    this.newLevelNumber = this.nextSuggestedLevel();
    this.newLevelUserIds.set([]);
    this.newLevelSearch.set('');
    this.addError.set('');
  }

  cancelAddLevel() {
    this.addingLevel.set(false);
    this.newLevelUserIds.set([]);
    this.newLevelSearch.set('');
    this.addError.set('');
  }

  toggleNewLevelUser(userId: string, checked: boolean) {
    const current = this.newLevelUserIds();
    if (checked) {
      if (!current.includes(userId)) this.newLevelUserIds.set([...current, userId]);
    } else {
      this.newLevelUserIds.set(current.filter((id) => id !== userId));
    }
  }

  confirmAddLevel() {
    const level = Number(this.newLevelNumber);
    if (!Number.isInteger(level) || level < 1) {
      this.addError.set('Ingresa un número de nivel válido (entero mayor o igual a 1).');
      return;
    }
    if (this.levels().some((l) => l.level === level)) {
      this.addError.set(`Ya existe un Nivel ${level} configurado.`);
      return;
    }
    if (this.newLevelUserIds().length === 0) {
      this.addError.set('Selecciona al menos un aprobador para el nivel.');
      return;
    }
    this.emit([...this.levels(), { level, userIds: [...this.newLevelUserIds()] }]);
    this.cancelAddLevel();
  }
}
