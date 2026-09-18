import { destroySession, ok, serverError } from "@/lib/hrms/auth";

export async function POST() {
  try {
    await destroySession();
    return ok({ loggedOut: true });
  } catch (err) {
    return serverError(err);
  }
}
