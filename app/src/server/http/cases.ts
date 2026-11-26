import "server-only";

import { z } from "zod";
import type { CaseService } from "@/server/cases/service";
import type { CaseStore } from "@/server/cases/store";
import { AppError, CaseNotFoundError, ValidationError, toErrorResponse } from "@/server/errors";

// Handlers for the case endpoints (ADR-002 §5.1 – §5.2). Route files only call these factories.
export type RequestHandler = (req: Request) => Promise<Response>;
export type ParamsHandler = (req: Request, ctx: { params: Promise<{ caseId: string }> }) => Promise<Response>;

export interface CasesHandlerDeps {
  service: CaseService;
  store: CaseStore;
}

// ADR-002 §5.1: the 10 MiB photo limit plus 1 MiB for the form fields. Checked before the body is read.
const MAX_REQUEST_BYTES = 11_534_336;
const caseIdSchema = z.uuid();

// Responses carry the Polish text for the code, never err.message (toErrorResponse).
function failure(err: unknown): Response {
  const { status, body } = toErrorResponse(err);
  return Response.json(body, { status });
}

async function readForm(req: Request): Promise<FormData> {
  try {
    return await req.formData();
  } catch {
    throw new ValidationError({});
  }
}

function textField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

export function createCasesHandlers(deps: CasesHandlerDeps): {
  create: RequestHandler;
  decide: ParamsHandler;
  remove: ParamsHandler;
} {
  const create: RequestHandler = async (req) => {
    try {
      const declared = Number(req.headers.get("content-length") ?? 0);
      if (declared > MAX_REQUEST_BYTES) throw new AppError("FILE_TOO_LARGE", 413, "Request body exceeds the limit");

      const form = await readForm(req);
      const entry = form.get("image");
      const file =
        entry instanceof File
          ? { bytes: Buffer.from(await entry.arrayBuffer()), declaredType: entry.type, size: entry.size }
          : null;

      const { caseId } = await deps.service.create({
        form: {
          caseType: textField(form, "caseType"),
          category: textField(form, "category"),
          modelName: textField(form, "modelName"),
          purchaseDate: textField(form, "purchaseDate"),
          description: textField(form, "description"),
        },
        file,
        signal: req.signal,
      });
      return Response.json({ caseId }, { status: 201 });
    } catch (err) {
      return failure(err);
    }
  };

  const decide: ParamsHandler = async (req, ctx) => {
    try {
      const { caseId } = await ctx.params;
      // A malformed id cannot name a stored case, so it is reported as not found without a lookup.
      if (!caseIdSchema.safeParse(caseId).success) throw new CaseNotFoundError();
      const message = await deps.service.decide({ caseId, signal: req.signal });
      return Response.json({ message });
    } catch (err) {
      return failure(err);
    }
  };

  const remove: ParamsHandler = async (_req, ctx) => {
    try {
      const { caseId } = await ctx.params;
      deps.store.delete(caseId);
      return new Response(null, { status: 204 });
    } catch (err) {
      return failure(err);
    }
  };

  return { create, decide, remove };
}
