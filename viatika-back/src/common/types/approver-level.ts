import { Types } from 'mongoose'

/**
 * Aprobadores de un nivel explícito (identidad fija: 1, 2, 3…). Lo comparten
 * las dos fuentes de aprobadores que alimentan el motor de cadena
 * (`approval-chain.util.ts`):
 *  - `Project.approverLevels` — niveles del centro de costo.
 *  - `User.permissions.approverLevels` — niveles propios del colaborador
 *    (regla 1.10), que sustituyen a los del centro principal cuando existen.
 *
 * Un nivel sin aprobadores no se persiste y se omite en la cadena sin
 * renumerar (regla 1.6).
 */
export interface ApproverLevel {
  level: number
  userIds: Types.ObjectId[]
}

/** Forma Mongoose de un `ApproverLevel` para subdocumentos embebidos. */
export const approverLevelSchemaDefinition = {
  level: { type: Number, required: true },
  userIds: { type: [{ type: Types.ObjectId, ref: 'User' }], default: [] },
  _id: false,
}

/** `true` si la fuente tiene al menos un nivel con aprobadores configurados. */
export function hasConfiguredLevels(levels?: ApproverLevel[]): boolean {
  return (levels ?? []).some(l => (l.userIds?.length ?? 0) > 0)
}
