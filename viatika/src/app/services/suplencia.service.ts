import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserStateService } from './user-state.service';

/** Vacaciones programadas de un aprobador y quién firma en su lugar (VD-124). */
export interface ISuplencia {
  desde: string;
  hasta: string;
  suplenteId: string;
  /**
   * Nombre del suplente, resuelto por el backend. Sin esto la pantalla tendría
   * que cargar la lista completa de colaboradores solo para traducir un id, y
   * al refrescar —antes de que llegue— mostraba un texto genérico.
   */
  suplenteName?: string | null;
}

/** Titular al que este usuario está cubriendo ahora mismo. */
export interface ITitularCubierto {
  _id: string;
  name: string;
}

export interface IMisSuplencias {
  /** A quiénes reemplaza hoy. Vacío = está aprobando solo por sí mismo. */
  cubroA: ITitularCubierto[];
  /** Su propia suplencia programada, si tiene una. */
  vacaciones: ISuplencia | null;
}

/** Rendición que este usuario firmó cubriendo a otro (historial, VD-124). */
export interface IAprobadaEnReemplazo {
  _id: string;
  title?: string;
  status?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  userId?: { _id: string; name?: string } | string;
  /** Nombres de los titulares que cubrió en ese documento. */
  enReemplazoDe: string[];
}

/** Suplencia vigente de cualquiera de la empresa (VD-124). */
export interface ISuplenciaVigente {
  titularId: string;
  titularName: string;
  suplenteId: string;
  suplenteName: string;
}

/** Colaborador de la empresa, para elegir suplente. */
export interface IColaboradorBasico {
  _id: string;
  name: string;
  email?: string;
  dni?: string;
}

/**
 * Suplencia por vacaciones (VD-124).
 *
 * El backend resuelve la suplencia expandiendo la identidad del actor: durante
 * el período, el suplente responde también por la identidad de su titular. El
 * front tiene que hacer EXACTAMENTE lo mismo, porque decide por su cuenta qué
 * botones muestra comparando el usuario actual contra `approverChain.approverIds`.
 * Si solo se arregla el backend, el suplente ve la rendición en la lista pero
 * al entrar no le aparece el botón de aprobar.
 *
 * Por eso `cubroA` vive acá como signal cargada una sola vez: los componentes
 * la leen de forma síncrona con `identidades()` y Angular re-evalúa los botones
 * cuando la respuesta llega.
 */
@Injectable({ providedIn: 'root' })
export class SuplenciaService {
  private http = inject(HttpClient);
  private userState = inject(UserStateService);
  private apiUrl = `${environment.api}/user`;

  /** Titulares que el usuario cubre ahora mismo. Vacío mientras no se cargue. */
  private _cubroA = signal<ITitularCubierto[]>([]);
  readonly cubroA = this._cubroA.asReadonly();
  private readonly cubroAIds = computed(() => this._cubroA().map((t) => t._id));

  /** Su propia suplencia programada. */
  private _miVacacion = signal<ISuplencia | null>(null);
  readonly miVacacion = this._miVacacion.asReadonly();

  /**
   * TODAS las suplencias vigentes de la empresa. Hace falta para que CUALQUIERA
   * —el colaborador que rinde, Contabilidad— sepa quién va a firmar de verdad:
   * la cadena nombra al titular, y si está de vacaciones el documento parece
   * trabado esperando a alguien que no está.
   */
  private _vigentes = signal<ISuplenciaVigente[]>([]);
  readonly vigentes = this._vigentes.asReadonly();

  // Sin carga en el constructor a proposito: disparar HTTP al construir el
  // servicio obliga a cada spec que stubea UserStateService a declarar
  // `getToken`, y revienta 70 pruebas que no tienen nada que ver con esto.
  // La carga la piden las pantallas que la necesitan (`cargar()` es idempotente):
  // el banner de suplencia en las de aprobacion, e `inicio` en su ngOnInit.

  private headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.userState.getToken()}`,
      'Content-Type': 'application/json',
    });
  }

  /** Refresca el estado de suplencia. Idempotente: se puede llamar al entrar a cada pantalla. */
  cargar(): Observable<IMisSuplencias> {
    // Las suplencias de la empresa se refrescan junto con las propias: las dos
    // alimentan la misma pantalla y no tiene sentido pedirlas por separado.
    this.http
      .get<ISuplenciaVigente[]>(`${this.apiUrl}/suplencias-vigentes`, {
        headers: this.headers(),
      })
      .subscribe({
        next: (v) => this._vigentes.set(v ?? []),
        error: () => this._vigentes.set([]),
      });
    return this.getMisSuplencias().pipe(
      tap((d) => {
        this._cubroA.set(d?.cubroA ?? []);
        this._miVacacion.set(d?.vacaciones ?? null);
      })
    );
  }

  /**
   * Contexto listo para `buildReportFlowSteps`: a quién cubro yo (para el
   * "te toca a ti") y las suplencias de la empresa (para que el resto vea quién
   * va a firmar).
   */
  contextoParaLineaDeTiempo(): { cubroA: ITitularCubierto[]; vigentes: ISuplenciaVigente[] } {
    return { cubroA: this._cubroA(), vigentes: this._vigentes() };
  }

  /** Quién cubre a este aprobador ahora mismo, o `null` si no está de vacaciones. */
  suplenteDe(titularId: string | null | undefined): ISuplenciaVigente | null {
    if (!titularId) return null;
    return this._vigentes().find((v) => v.titularId === String(titularId)) ?? null;
  }

  /** A quién cubro hoy y qué vacaciones tengo programadas. */
  getMisSuplencias(): Observable<IMisSuplencias> {
    return this.http.get<IMisSuplencias>(`${this.apiUrl}/profile/suplencias`, {
      headers: this.headers(),
    });
  }

  /**
   * Identidades con las que actúa el usuario: la suya y las de los titulares
   * que cubre. La propia va primero y nunca se pierde — la suplencia es
   * aditiva, igual que en el backend.
   */
  identidades(miId: string | null | undefined): string[] {
    const mio = miId ? [String(miId)] : [];
    return [...new Set([...mio, ...this.cubroAIds()])];
  }

  /** ¿Alguna de mis identidades es aprobadora de este paso de la cadena? */
  esAprobadorDelPaso(step: any, miId: string | null | undefined): boolean {
    const ids = this.identidades(miId);
    return (step?.approverIds ?? []).some((a: any) =>
      ids.includes(String(typeof a === 'object' ? a?._id : a))
    );
  }

  /** Nombre del titular que cubro dentro de este paso, si firmo en su lugar. */
  titularCubiertoEnPaso(step: any, miId: string | null | undefined): string | null {
    const enPaso = (step?.approverIds ?? []).map((a: any) =>
      String(typeof a === 'object' ? a?._id : a)
    );
    if (miId && enPaso.includes(String(miId))) return null;
    const titular = this._cubroA().find((t) => enPaso.includes(t._id));
    return titular?.name ?? null;
  }

  /**
   * Nombre del titular que cubro en esta cadena, o `null` si actúo por mí.
   *
   * Es lo que alimenta la marca "En reemplazo de X" de las listas. Sin ella los
   * documentos del titular se mezclan con los propios sin ninguna señal, que es
   * el problema que Workday resuelve marcando cada tarea delegada y que en
   * ServiceNow y Concur genera el clásico "no entiendo por qué me aparece esto".
   */
  titularCubiertoEnCadena(
    chain: any[] | null | undefined,
    miId: string | null | undefined
  ): string | null {
    for (const paso of chain ?? []) {
      if (paso?.approved) continue;
      const titular = this.titularCubiertoEnPaso(paso, miId);
      if (titular) return titular;
    }
    return null;
  }

  /** Programa mis vacaciones. Las fechas van como `YYYY-MM-DD`. */
  setMisVacaciones(datos: ISuplencia): Observable<unknown> {
    return this.http
      .patch(`${this.apiUrl}/profile/vacaciones`, datos, { headers: this.headers() })
      .pipe(tap(() => this.cargar().subscribe()));
  }

  /** Vuelta anticipada: retomo mis aprobaciones. */
  borrarMisVacaciones(): Observable<unknown> {
    return this.http
      .delete(`${this.apiUrl}/profile/vacaciones`, { headers: this.headers() })
      .pipe(tap(() => this.cargar().subscribe()));
  }

  /** Un administrador programa las vacaciones de otro. */
  setVacaciones(userId: string, datos: ISuplencia): Observable<unknown> {
    return this.http.patch(`${this.apiUrl}/${userId}/vacaciones`, datos, {
      headers: this.headers(),
    });
  }

  borrarVacaciones(userId: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/${userId}/vacaciones`, {
      headers: this.headers(),
    });
  }

  /**
   * Historial: lo que aprobé en reemplazo de otro. Sigue disponible después de
   * que termina la vacación, porque sale de `approvedOnBehalfOf` grabado en el
   * documento y no de la suplencia vigente.
   */
  getAprobadasEnReemplazo(): Observable<IAprobadaEnReemplazo[]> {
    return this.http.get<IAprobadaEnReemplazo[]>(
      `${environment.api}/expense-report/aprobadas-en-reemplazo`,
      { headers: this.headers() }
    );
  }

  /** Colaboradores activos de la empresa, para el selector de suplente. */
  getColaboradores(): Observable<IColaboradorBasico[]> {
    return this.http.get<IColaboradorBasico[]>(`${this.apiUrl}/colaboradores`, {
      headers: this.headers(),
    });
  }
}
