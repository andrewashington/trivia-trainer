import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { RecipeForm } from "@/modules/cookbook/RecipeForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Edit recipe" };

export default async function EditRecipePage({ params }: { params: { id: string } }) {
  const [user, recipe] = await Promise.all([
    currentUser(),
    db.recipe.findUnique({ where: { id: params.id } }),
  ]);
  if (!recipe) notFound();
  if (!user || (user.id !== recipe.authorId && user.role !== "admin")) {
    redirect(`/cookbook/${recipe.id}`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Edit recipe" accentBg="bg-accent-red text-white" />
      <RecipeForm recipe={recipe} />
    </div>
  );
}
