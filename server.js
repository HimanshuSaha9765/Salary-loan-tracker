import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import authHandler from "./api/auth.js";
import dashboardHandler from "./api/dashboard.js";
import employeesHandler from "./api/employees.js";
import entriesHandler from "./api/entries.js";
import loansHandler from "./api/loans.js";
import managersHandler from "./api/managers.js";
import assignmentsHandler from "./api/assignments.js";
import auditLogsHandler from "./api/audit-logs.js";
import managerFinanceHandler from "./api/manager-finance.js";
import { warmDatabase, startDatabaseKeepAlive } from "./api/_lib/db.js";

const app = express();
const directory = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", authHandler);
app.use("/api/dashboard", dashboardHandler);
app.use("/api/employees", employeesHandler);
app.use("/api/entries", entriesHandler);
app.use("/api/loans", loansHandler);
app.use("/api/managers", managersHandler);
app.use("/api/assignments", assignmentsHandler);
app.use("/api/audit-logs", auditLogsHandler);
app.use("/api/manager-finance", managerFinanceHandler);
app.use(express.static(join(directory, "public")));
app.get("/", (request, response) => response.redirect("/login.html"));
app.get("/:page", (request, response, next) => {
  if (request.params.page.includes(".")) return next();
  return response.sendFile(
    join(directory, "public", `${request.params.page}.html`),
    (error) => {
      if (error) next();
    },
  );
});

warmDatabase()
  .then(() => {
    startDatabaseKeepAlive();
    app.listen(port, () =>
      console.log(`Salary Tracker running at http://localhost:${port}`),
    );
  })
  .catch((error) => {
    console.error("Database warmup failed:", error.message);
    process.exit(1);
  });
