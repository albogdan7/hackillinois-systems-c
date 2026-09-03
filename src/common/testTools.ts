import supertest from "supertest";
import { app } from "../app";

export const get = (url: string) => supertest(app).get(url);
export const post = (url: string) => supertest(app).post(url);
export const put = (url: string) => supertest(app).put(url);
export const patch = (url: string) => supertest(app).patch(url);
export const del = (url: string) => supertest(app).delete(url);
