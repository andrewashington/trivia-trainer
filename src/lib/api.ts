import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { HttpError } from "@/lib/session";

/**
 * Wrap an API handler with uniform error mapping: HttpError -> its
 * status, ZodError -> 400 with field details, anything else -> 500.
 */
export function apiHandler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse | Response>
) {
  return async (...args: Args): Promise<NextResponse | Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid input.", details: err.flatten().fieldErrors },
          { status: 400 }
        );
      }
      console.error(err);
      return NextResponse.json(
        { error: "Something went wrong." },
        { status: 500 }
      );
    }
  };
}

/** Parse and validate a JSON body against a zod schema (400 on failure). */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
  return schema.parse(json);
}
