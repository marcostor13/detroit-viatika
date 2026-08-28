import { Injectable } from '@angular/core';

/**
 * Filtros de una bandeja, recordados mientras dure la sesión de la pestaña.
 *
 * El caso que resuelve: quien revisa filtra por un estado ("En contabilidad"),
 * entra a una rendición, la aprueba y vuelve a la bandeja. Como el back
 * re-crea el componente de la lista, los filtros nacían vacíos y había que
 * volver a aplicarlos en cada documento revisado.
 *
 * Se guarda en `sessionStorage` (no en `localStorage`) a propósito: es estado
 * de trabajo de ESTA pestaña, no una preferencia del usuario. Cerrar la
 * pestaña lo descarta, y `clearAll()` lo borra al cerrar sesión para que los
 * filtros de un usuario (ids de colaborador o centro de costo que el
 * siguiente puede no ver) no se arrastren a la sesión que sigue.
 */
@Injectable({ providedIn: 'root' })
export class ListFiltersService {
  private readonly prefix = 'viatika.filtros.';

  /**
   * Respaldo cuando `sessionStorage` no está disponible (modo privado de
   * algunos navegadores, cuota llena). Sin él, la pantalla se caería al filtrar.
   */
  private readonly memory = new Map<string, Record<string, unknown>>();

  /** Filtros guardados para esa bandeja. `{}` si no hay nada o está corrupto. */
  read<T extends Record<string, unknown>>(key: string): Partial<T> {
    const stored = this.memory.get(key);
    if (stored) return stored as Partial<T>;
    try {
      const raw = sessionStorage.getItem(this.prefix + key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : {};
    } catch {
      return {};
    }
  }

  /** Reemplaza los filtros guardados de esa bandeja. */
  write(key: string, values: Record<string, unknown>): void {
    this.memory.set(key, values);
    try {
      sessionStorage.setItem(this.prefix + key, JSON.stringify(values));
    } catch {
      // El respaldo en memoria ya quedó puesto: la bandeja sigue recordando
      // los filtros dentro de la misma carga de la aplicación.
    }
  }

  /** Olvida los filtros de una bandeja. */
  clear(key: string): void {
    this.memory.delete(key);
    try {
      sessionStorage.removeItem(this.prefix + key);
    } catch {}
  }

  /** Olvida los de todas. Se llama al cerrar sesión. */
  clearAll(): void {
    this.memory.clear();
    try {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(this.prefix)) keys.push(k);
      }
      for (const k of keys) sessionStorage.removeItem(k);
    } catch {}
  }
}
