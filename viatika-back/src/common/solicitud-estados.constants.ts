/**
 * Estados en los que una solicitud de fondos YA NO está pendiente de rendir.
 * Cerrar es una acción de Tesorería (`PATCH /:id/close`, VD-66/VD-49);
 * rechazada y cancelada entran porque tampoco van a rendirse nunca.
 *
 * Vive aquí y no en `expense-report.service.ts` porque el tope de solicitudes
 * abiertas (VD-139) y el dashboard tienen que contar exactamente lo mismo: si
 * la lista se duplica, el colaborador ve "0 pendientes" en el dashboard y aun
 * así el sistema le bloquea la siguiente solicitud.
 */
export const ESTADOS_SOLICITUD_CERRADA = ['closed', 'rejected', 'cancelled']
