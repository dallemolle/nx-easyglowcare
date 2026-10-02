import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runOutboxJob: vi.fn(), runCleanupJob: vi.fn() }));

vi.mock("@/server/jobs/run", () => ({
  runOutboxJob: mocks.runOutboxJob,
  runCleanupJob: mocks.runCleanupJob,
}));

import { GET as cleanupGET } from "./cleanup/route";
import { GET as outboxGET } from "./outbox/route";

const SECRET = "segredo-do-cron-0123456789";

const routes = [
  {
    name: "/api/cron/outbox",
    GET: outboxGET,
    job: mocks.runOutboxJob,
    counts: { claimed: 2, sent: 1, retried: 1, failed: 0 },
  },
  {
    name: "/api/cron/cleanup",
    GET: cleanupGET,
    job: mocks.runCleanupJob,
    counts: { loginAttempts: 3, sessions: 2, sentMessages: 1 },
  },
];

const request = (name: string, authorization?: string) =>
  new Request(`http://localhost${name}`, {
    headers: authorization === undefined ? {} : { authorization },
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(routes)("GET $name", ({ name, GET, job, counts }) => {
  it("sem cabeçalho: 401 e o job não roda", async () => {
    const response = await GET(request(name));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(job).not.toHaveBeenCalled();
  });

  it("segredo errado: 401 e o job não roda", async () => {
    const response = await GET(request(name, "Bearer segredo-errado-0123456789"));

    expect(response.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("sem CRON_SECRET configurado: 401 mesmo com cabeçalho", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(request(name, `Bearer ${SECRET}`));

    expect(response.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("segredo certo: 200 com as contagens", async () => {
    job.mockResolvedValue(counts);

    const response = await GET(request(name, `Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(counts);
    expect(job).toHaveBeenCalledOnce();
  });

  it("erro no job: 500 sem detalhe, e o log não carrega a mensagem", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    job.mockRejectedValue(
      Object.assign(new Error("Failed query: ... params: 11987651234"), { cause: { code: "08006" } }),
    );

    const response = await GET(request(name, `Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal" });
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("08006");
    expect(logged).not.toContain("11987651234");
  });
});
