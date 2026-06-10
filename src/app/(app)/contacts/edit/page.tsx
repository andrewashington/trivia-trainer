import { redirect } from "next/navigation";

// The contact card is edited on the profile page now — one place for
// everything about you. Kept as a redirect so old links keep working.
export default function EditContactPage() {
  redirect("/me#card");
}
