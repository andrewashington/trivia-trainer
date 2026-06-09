import { RecipeForm } from "@/modules/cookbook/RecipeForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New recipe" };

export default function NewRecipePage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New recipe" accentBg="bg-accent-red text-white" />
      <RecipeForm />
    </div>
  );
}
