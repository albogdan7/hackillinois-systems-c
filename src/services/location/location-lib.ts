import { APIError } from "../../common/errors";
import { paginate, PaginationInput } from "../../common/paginate";
import { LocationModel, CreateLocationInput, UpdateLocationInput } from "./location-schemas";

export async function getAllLocations(pagination: PaginationInput) {
  return paginate(LocationModel, {}, { name: 1 }, pagination);
}

export async function getLocationById(id: string) {
  const location = await LocationModel.findById(id);
  if (!location) {
    throw new APIError(404, "LocationNotFound", "Location not found");
  }
  return location;
}

export async function createLocation(data: CreateLocationInput) {
  const existing = await LocationModel.findOne({ name: data.name });
  if (existing) {
    throw new APIError(
      409,
      "LocationNameConflict",
      `A location named "${data.name}" already exists`
    );
  }
  return LocationModel.create(data);
}

export async function updateLocation(id: string, data: UpdateLocationInput) {
  if (data.name) {
    const existing = await LocationModel.findOne({
      name: data.name,
      _id: { $ne: id },
    });
    if (existing) {
      throw new APIError(
        409,
        "LocationNameConflict",
        `A location named "${data.name}" already exists`
      );
    }
  }
  const location = await LocationModel.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!location) {
    throw new APIError(404, "LocationNotFound", "Location not found");
  }
  return location;
}

export async function deleteLocation(id: string) {
  const location = await LocationModel.findByIdAndDelete(id);
  if (!location) {
    throw new APIError(404, "LocationNotFound", "Location not found");
  }
}
