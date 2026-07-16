import { listBrands } from "@/lib/db/brands";
import { getAppContext } from "@/lib/workspace-context";

import { AddBrandForm, BrandRow } from "./brands-client";

export const metadata = { title: "Brands — Signal" };

/**
 * Settings → Brands. Not drawn explicitly in the preview (brands appear only in
 * the switcher), but brand CRUD is a Phase 1 exit requirement, so this is the
 * management surface behind the switcher's "+ Add brand".
 */
export default async function BrandsPage() {
  const { workspace, role } = await getAppContext();
  const isAdmin = role === "owner" || role === "admin";

  const brands = await listBrands(workspace.id);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-semibold">Brands</h3>
        <span className="text-text-2 text-[0.8rem]">
          {brands.length} brand{brands.length === 1 ? "" : "s"}
        </span>
      </div>

      {!isAdmin && (
        <p className="text-text-2 mb-4 text-[0.85rem]">Only owners and admins can manage brands.</p>
      )}

      <div className="flex flex-col gap-3">
        {brands.map((brand) => (
          <BrandRow
            key={brand.id}
            brand={brand}
            canManage={isAdmin}
            remainingCount={brands.length}
          />
        ))}
      </div>

      {isAdmin && <AddBrandForm workspaceId={workspace.id} />}
    </>
  );
}
