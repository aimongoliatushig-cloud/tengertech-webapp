import "server-only";

import { cache } from "react";

import { getSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

type ProfileImageRecord = {
  id: number;
  image_128?: string | false;
  avatar_128?: string | false;
  image_1920?: string | false;
};

function imageDataUrl(value?: string | false) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("data:") ? trimmed : `data:image/png;base64,${trimmed}`;
}

export const loadCurrentUserProfileImageUrl = cache(async () => {
  const session = await getSession();
  if (!session) {
    return "";
  }

  const connection = {
    login: session.login,
    password: session.password,
  };
  const imageFields = ["id", "image_128", "avatar_128", "image_1920"];

  const employees = await executeOdooKw<ProfileImageRecord[]>(
    "hr.employee",
    "search_read",
    [[["user_id", "=", session.uid]]],
    { fields: imageFields, limit: 1 },
    connection,
  ).catch(() => []);
  const employeeImage = imageDataUrl(
    employees[0]?.image_128 || employees[0]?.avatar_128 || employees[0]?.image_1920,
  );

  if (employeeImage) {
    return employeeImage;
  }

  const users = await executeOdooKw<ProfileImageRecord[]>(
    "res.users",
    "search_read",
    [[["id", "=", session.uid]]],
    { fields: imageFields, limit: 1 },
    connection,
  ).catch(() => []);

  return imageDataUrl(users[0]?.image_128 || users[0]?.avatar_128 || users[0]?.image_1920);
});
