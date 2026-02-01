import { defineUserSignupFields } from "wasp/server/auth";

export const userSignupFields = defineUserSignupFields({
  email: (data) => {
    return data.email as string;
  },
  password: (data) => {
    return data.password as string;
  },
  name: (data) => {
    if (typeof data.name !== "string") {
      throw new Error("Name is required.");
    }
    if (data.name.length < 2) {
      throw new Error("Name must be at least 2 characters long.");
    }
    return data.name;
  },
  phone: (data) => {
    if (data.phone && typeof data.phone !== "string") {
      throw new Error("Phone must be a string.");
    }
    return data.phone ? String(data.phone) : null;
  },
});
