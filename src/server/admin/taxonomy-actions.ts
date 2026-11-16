"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import type { FieldErrors } from "./articles";
import { deleteCategory, deleteTag, saveCategory, saveTag } from "./taxonomy";

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);

function str(form: FormData, key: string, max = 400): string {
  const v = form.get(key);
  return typeof v === "string" ? v.slice(0, max) : "";
}

function invalidateCategories() {
  updateTag("categories");
  updateTag("navigation");
  updateTag("articles");
  updateTag("homepage");
}

export type TaxonomyFormState = { errors: FieldErrors; message: string };

export async function saveCategoryAction(_prev: TaxonomyFormState, form: FormData): Promise<TaxonomyFormState> {
  const admin = await requireAdmin();
  const rawId = str(form, "id", 40);
  if (rawId && !id.safeParse(rawId).success) return { errors: {}, message: "The form could not be read. Reload the page." };
  const parentId = str(form, "parentId", 40);
  if (parentId && !id.safeParse(parentId).success) return { errors: {}, message: "The form could not be read. Reload the page." };
  const sortOrder = Number.parseInt(str(form, "sortOrder", 10) || "0", 10);

  const result = await saveCategory({
    id: rawId || null,
    parentId: parentId || null,
    sortOrder: Number.isNaN(sortOrder) ? Number.NaN : sortOrder,
    isVisible: form.get("isVisible") === "on",
    si: { name: str(form, "si.name"), slug: str(form, "si.slug", 200).trim(), description: str(form, "si.description", 1000) },
    en: { name: str(form, "en.name"), slug: str(form, "en.slug", 200).trim(), description: str(form, "en.description", 1000) },
  });
  if (!result.ok) return { errors: result.errors, message: result.errors.form ?? "Nothing was saved. Fix the highlighted fields." };

  invalidateCategories();
  await audit({ adminId: admin.id, action: rawId ? "category.update" : "category.create", entityType: "Category", entityId: result.id, ip: (await requestMeta()).ip });
  redirect(`/admin/categories?saved=${rawId ? "updated" : "created"}`);
}

export async function deleteCategoryAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const categoryId = id.safeParse(form.get("categoryId"));
  if (!categoryId.success || form.get("confirm") !== "yes") redirect("/admin/categories");
  const result = await deleteCategory(categoryId.data);
  if (!result.ok) redirect(`/admin/categories/${categoryId.data}?error=${encodeURIComponent(result.error)}`);
  invalidateCategories();
  await audit({ adminId: admin.id, action: "category.delete", entityType: "Category", entityId: categoryId.data, ip: (await requestMeta()).ip });
  redirect("/admin/categories?saved=deleted");
}

export async function saveTagAction(_prev: TaxonomyFormState, form: FormData): Promise<TaxonomyFormState> {
  const admin = await requireAdmin();
  const rawId = str(form, "id", 40);
  if (rawId && !id.safeParse(rawId).success) return { errors: {}, message: "The form could not be read. Reload the page." };
  const result = await saveTag({
    id: rawId || null,
    si: { name: str(form, "si.name"), slug: str(form, "si.slug", 200) },
    en: { name: str(form, "en.name"), slug: str(form, "en.slug", 200) },
  });
  if (!result.ok) return { errors: result.errors, message: result.errors.form ?? "Nothing was saved. Fix the highlighted fields." };
  updateTag("tags");
  updateTag("articles");
  await audit({ adminId: admin.id, action: rawId ? "tag.update" : "tag.create", entityType: "Tag", entityId: result.id, ip: (await requestMeta()).ip });
  redirect(`/admin/tags?saved=${rawId ? "updated" : "created"}`);
}

export async function deleteTagAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const tagId = id.safeParse(form.get("tagId"));
  if (!tagId.success || form.get("confirm") !== "yes") redirect("/admin/tags");
  if (await deleteTag(tagId.data)) {
    updateTag("tags");
    updateTag("articles");
    await audit({ adminId: admin.id, action: "tag.delete", entityType: "Tag", entityId: tagId.data, ip: (await requestMeta()).ip });
  }
  redirect("/admin/tags?saved=deleted");
}
