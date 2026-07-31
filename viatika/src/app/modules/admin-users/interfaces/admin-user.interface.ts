import { IUser } from '../../../interfaces/user.interface';

export interface IAdminUser extends IUser {
  _id?: string;
  role: string;
}
