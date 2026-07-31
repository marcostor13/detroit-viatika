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
  limits?: {
    movilidadDiario?: number | null;
  };
  notificationSettings?: {
    enabled: boolean;
    frequency: 'semanal' | 'mensual';
    /** 0=Dom … 6=Sáb (default 1=Lunes). Solo aplica con frequency='semanal'. */
    notificationDay?: number;
  };
  tesoreriaEmails?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
