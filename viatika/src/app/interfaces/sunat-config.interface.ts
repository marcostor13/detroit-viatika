export interface ISunatConfig {
  _id?: string;
  companyId: string;
  clientId: string;
  clientIdSunat: string;
  clientSecret: string;
  ruc: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISunatCredentials {
  clientId: string;
  clientIdSunat: string;
  clientSecret: string;
}
