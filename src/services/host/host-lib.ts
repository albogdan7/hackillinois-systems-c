import { APIError } from "../../common/errors";
import { paginate, PaginationInput } from "../../common/paginate";
import { HostModel, CreateHostInput, UpdateHostInput } from "./host-schemas";
import { EventModel } from "../event/event-schemas";

export async function getAllHosts(pagination: PaginationInput) {
  return paginate(HostModel, {}, { companyName: 1 }, pagination);
}

export async function getHostById(id: string) {
  const host = await HostModel.findById(id);
  if (!host) {
    throw new APIError(404, "HostNotFound", "Host not found");
  }
  return host;
}

export async function createHost(data: CreateHostInput) {
  const existing = await HostModel.findOne({ companyName: data.companyName });
  if (existing) {
    throw new APIError(
      409,
      "HostNameConflict",
      `A host named "${data.companyName}" already exists`
    );
  }
  return HostModel.create(data);
}

export async function updateHost(id: string, data: UpdateHostInput) {
  if (data.companyName) {
    const existing = await HostModel.findOne({
      companyName: data.companyName,
      _id: { $ne: id },
    });
    if (existing) {
      throw new APIError(
        409,
        "HostNameConflict",
        `A host named "${data.companyName}" already exists`
      );
    }
  }
  const host = await HostModel.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!host) {
    throw new APIError(404, "HostNotFound", "Host not found");
  }
  return host;
}

export async function deleteHost(id: string) {
  const host = await HostModel.findByIdAndDelete(id);
  if (!host) {
    throw new APIError(404, "HostNotFound", "Host not found");
  }
}

export async function getHostEvents(id: string, pagination: PaginationInput) {
  await getHostById(id);
  return paginate(EventModel, { hostId: id }, { startDate: 1 }, pagination);
}
