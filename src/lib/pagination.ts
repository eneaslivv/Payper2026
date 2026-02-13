/**
 * PAGINATION UTILITIES
 *
 * Previene OOM y timeouts al limitar queries automáticamente
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginationResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Añade paginación a una query de Supabase
 *
 * @example
 * const { data: orders } = await paginate(
 *   supabase.from('orders').select('*').eq('store_id', storeId),
 *   { page: 1, pageSize: 25 }
 * );
 */
export const paginate = <T extends { range: Function; limit: Function }>(
  query: T,
  options: PaginationOptions = {}
): T => {
  const page = options.page || 1;
  const pageSize = Math.min(options.pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  return query.range(start, end).limit(pageSize) as T;
};

/**
 * Añade límite máximo a cualquier query para seguridad
 * Usar cuando no se necesita paginación pero sí límite
 *
 * @example
 * const { data: clients } = await safeQuery(
 *   supabase.from('clients').select('*')
 * );
 */
export const safeQuery = <T extends { limit: Function }>(query: T): T => {
  return query.limit(MAX_PAGE_SIZE) as T;
};

/**
 * Helper para calcular info de paginación
 */
export const getPaginationInfo = (
  currentPage: number,
  pageSize: number,
  totalCount: number
) => {
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  return {
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage,
    hasPrevPage,
    startIndex: (currentPage - 1) * pageSize,
    endIndex: Math.min(currentPage * pageSize, totalCount)
  };
};
