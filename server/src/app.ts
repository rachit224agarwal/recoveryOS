import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { transactionsRouter } from "./routes/transactions.js";
import { simulationRouter } from "./routes/simulation.js";
import { runsRouter } from "./routes/runs.js";
import { auditRouter } from "./routes/audit.js";
import { analyticsRouter } from "./routes/analytics.js";
import { metaRouter } from "./routes/meta.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { paymentsRouter } from "./routes/payments.js";
import { errorHandler, notFoundHandler } from "./utils/api.js";

export function createApp(): express.Express {
  const app = express();

  app.use(
    cors({
      origin: [env.clientUrl, "http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: false,
    })
  );

  // Webhooks need the RAW body for HMAC verification — mount before express.json.
  app.use("/api/webhooks", webhooksRouter);

  app.use(express.json({ limit: "256kb" }));

  app.use("/api/meta", metaRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/simulations", simulationRouter);
  app.use("/api/runs", runsRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/payments", paymentsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
