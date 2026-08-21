import { Types } from 'mongoose'
import {
  finDelDia,
  inicioDelDia,
  normalizarSuplencia,
  suplenciaVigente,
} from './suplencia'

describe('suplencia (VD-124)', () => {
  const suplenteId = new Types.ObjectId()

  const enDia = (iso: string, hora = 12) => {
    const d = new Date(`${iso}T00:00:00`)
    d.setHours(hora, 0, 0, 0)
    return d
  }

  describe('normalizarSuplencia', () => {
    it('estira el rango a días completos', () => {
      const s = normalizarSuplencia({
        desde: '2026-09-01',
        hasta: '2026-09-10',
        suplenteId: suplenteId.toString(),
      })
      expect(s.desde.getHours()).toBe(0)
      expect(s.desde.getMinutes()).toBe(0)
      expect(s.hasta.getHours()).toBe(23)
      expect(s.hasta.getMinutes()).toBe(59)
      expect(s.suplenteId.toString()).toBe(suplenteId.toString())
    })

    it('acepta un solo día (desde = hasta)', () => {
      const s = normalizarSuplencia({
        desde: '2026-09-01',
        hasta: '2026-09-01',
        suplenteId,
      })
      expect(s.desde.getTime()).toBeLessThan(s.hasta.getTime())
      expect(suplenciaVigente(s, enDia('2026-09-01'))).toBe(true)
    })
  })

  describe('suplenciaVigente', () => {
    const vacaciones = normalizarSuplencia({
      desde: '2026-09-01',
      hasta: '2026-09-10',
      suplenteId,
    })

    it('cubre el primer día desde la primera hora', () => {
      expect(suplenciaVigente(vacaciones, enDia('2026-09-01', 0))).toBe(true)
    })

    it('cubre el último día hasta la última hora', () => {
      expect(suplenciaVigente(vacaciones, enDia('2026-09-10', 23))).toBe(true)
    })

    it('no cubre el día anterior ni el siguiente', () => {
      expect(suplenciaVigente(vacaciones, enDia('2026-08-31', 23))).toBe(false)
      expect(suplenciaVigente(vacaciones, enDia('2026-09-11', 0))).toBe(false)
    })

    it('es falsa sin vacaciones o con datos incompletos', () => {
      expect(suplenciaVigente(undefined)).toBe(false)
      expect(suplenciaVigente(null)).toBe(false)
      expect(
        suplenciaVigente({ desde: new Date(), hasta: new Date() } as any)
      ).toBe(false)
    })

    // Un documento escrito a mano por un script puede traer las horas sin
    // normalizar; el último día tiene que seguir contando entero.
    it('normaliza los extremos aunque vengan con hora', () => {
      const aMano = {
        desde: enDia('2026-09-01', 15),
        hasta: enDia('2026-09-10', 9),
        suplenteId,
      }
      expect(suplenciaVigente(aMano, enDia('2026-09-01', 8))).toBe(true)
      expect(suplenciaVigente(aMano, enDia('2026-09-10', 20))).toBe(true)
    })
  })

  describe('inicioDelDia / finDelDia', () => {
    it('no mutan la fecha que reciben', () => {
      const original = enDia('2026-09-05', 13)
      const copia = new Date(original)
      inicioDelDia(original)
      finDelDia(original)
      expect(original.getTime()).toBe(copia.getTime())
    })
  })
})
