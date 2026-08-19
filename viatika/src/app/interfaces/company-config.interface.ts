export interface ICompanyConfig {
  _id?: string;
  companyId: string;
  name: string;
  logo?: string;
  logoFile?: File;
  businessId?: string;
  businessName?: string;
  comercialName?: string;
  email?: string;
  phone?: string;
  /** Cuenta de cargo para el archivo de pagos BBVA (cabecera). */
  paymentAccount?: string;
  limits?: {
    movilidadDiario?: number | null;
    /** Topes por comida de "Alimentación sin documentación" (VD-109), por gasto. */
    alimentacionDesayuno?: number | null;
    alimentacionAlmuerzo?: number | null;
    alimentacionCena?: number | null;
    /**
     * Tope de alerta por comprobante: uno solo para toda la empresa, sin
     * distinguir categoría. Solo advierte, nunca bloquea.
     */
    topeComprobante?: number | null;
  };
  notificationSettings?: {
    enabled: boolean;
    frequency: 'semanal' | 'mensual';
    /** 0=Dom … 6=Sáb (default 1=Lunes). Solo aplica con frequency='semanal'. */
    notificationDay?: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}
