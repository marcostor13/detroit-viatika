export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}
