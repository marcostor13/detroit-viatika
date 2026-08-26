/**
 * Etiqueta visible de cada paso de una cadena de aprobación.
 *
 * Un mismo nivel puede aparecer MÁS DE UNA VEZ en la cadena. Ocurre cuando el
 * centro de costo del documento no es de los asignados al colaborador (regla
 * 1.4, `buildRendicionChain`): la cadena es N1 → N2 del centro principal → N2
 * del centro seleccionado, y los dos últimos pasos son de nivel 2. Lo mismo en
 * la solicitud de fondos hacia otro centro de costo (regla 1.3,
 * `buildSolicitudChain`), donde los dos pasos son de nivel 2.
 *
 * Numerando solo por `level`, esos dos pasos se mostraban como un único "N2"
 * con todos los aprobadores juntos, y el colaborador no podía saber en cuál de
 * las dos etapas estaba trabado ni quién le faltaba en cada una.
 *
 * Un nivel que aparece una sola vez conserva la etiqueta simple ("N1"); los
 * pasos de un nivel repetido se sub-numeran en el orden de la cadena ("N2-1",
 * "N2-2").
 *
 * @param levels niveles de los pasos, EN EL ORDEN de la cadena.
 */
export function chainLevelLabels(levels: number[]): string[] {
  const totalPorNivel = new Map<number, number>();
  for (const level of levels) {
    totalPorNivel.set(level, (totalPorNivel.get(level) ?? 0) + 1);
  }
  const vistos = new Map<number, number>();
  return levels.map((level) => {
    if ((totalPorNivel.get(level) ?? 0) <= 1) return `N${level}`;
    const orden = (vistos.get(level) ?? 0) + 1;
    vistos.set(level, orden);
    return `N${level}-${orden}`;
  });
}

/**
 * Etapa de la cadena a la que pertenece un paso: los aprobadores del centro de
 * costo PRINCIPAL del colaborador (o los suyos propios, regla 1.10) o los del
 * centro de costo SELECCIONADO en el documento. Es lo que distingue los dos
 * pasos de nivel 2 entre sí. Los pasos sin `projectRole` (cadenas viejas) se
 * tratan como del principal, que es donde nacían.
 */
export function chainStepStage(
  step: { projectRole?: string } | undefined | null,
): 'principal' | 'seleccionado' {
  return step?.projectRole === 'seleccionado' ? 'seleccionado' : 'principal';
}
