import { z } from "zod";
import { Model, FilterQuery, HydratedDocument, SortOrder } from "mongoose";

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export async function paginate<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  sort: { [key: string]: SortOrder },
  { page, limit }: PaginationInput,
  populateField?: string
): Promise<{ data: HydratedDocument<T>[]; pagination: Pagination }> {
  const skip = (page - 1) * limit;

  let query = model.find(filter).sort(sort).skip(skip).limit(limit);
  if (populateField) {
    query = query.populate(populateField) as typeof query;
  }

  const [data, total] = await Promise.all([
    query,
    model.countDocuments(filter),
  ]);

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return {
    data: data as HydratedDocument<T>[],
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}
